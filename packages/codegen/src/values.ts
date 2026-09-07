/**
 * Expressions -> JavaScript source — the resolver Phase 11 puts behind the emit templates.
 *
 * Everything in `emit.ts` was written against a document that held only `static` props, so
 * a condition was decided while emitting and the branch that lost was simply not written.
 * A bound prop cannot be decided then, so every one of those answers grows a second form:
 * a value is either something the generator knows now or a string of code the exported
 * page runs. `Emitted` is that fork, and this module is the only place it is made.
 *
 * **Nothing here rewrites what the author typed.** A hole's contents are copied through
 * verbatim, and the generated component defines `state`, `queries`, `item` and `index`
 * around them so the same text means the same thing (PLAN.md §11's note on portability).
 * What is written *around* a hole is the coercion the canvas applied to it — `text`,
 * `truthy`, `pick` and the rest are the export's copies of `stringifyValue`, `isTruthy`
 * and `asEnum`, which is what keeps a binding rendering one way in both places (D6).
 */

import { parseTemplate, singleExpressionOf, type Json, type PropValue } from '@ui-builder/schema';
import { stringLiteral } from './ir.js';

/**
 * A value the generator either knows now, or has to leave to the page.
 *
 * `undefined` on the static side means "the prop is not set", which is not the same as
 * an empty string — the difference is what decides whether an attribute is written.
 */
export type Emitted = { kind: 'static'; value: Json | undefined } | { kind: 'code'; code: string };

/* -------------------------------------------------------------------------- */
/* The helpers an export imports                                               */
/* -------------------------------------------------------------------------- */

/**
 * The value helpers `src/lib/values.ts` exports, named here so a page imports exactly the
 * ones it uses — the generated project sets `noUnusedLocals`, so an import it does not
 * need is a build failure rather than an untidiness.
 */
export type ValueHelper =
  'text' | 'truthy' | 'num' | 'pick' | 'list' | 'initials' | 'initial' | 'cx';

export type Helpers = Set<ValueHelper>;

function using<T extends ValueHelper>(helpers: Helpers, helper: T): T {
  helpers.add(helper);
  return helper;
}

/* -------------------------------------------------------------------------- */
/* Template source -> an expression                                            */
/* -------------------------------------------------------------------------- */

/**
 * A hole's code, safe to drop into a larger expression.
 *
 * Every place one is embedded is a position where an expression binds tighter than what
 * surrounds it — a call argument, an object value, a ternary arm — with one exception: a
 * comma. `text(a, b)` is a two-argument call where the author wrote a sequence, and
 * `{ count: a, b }` is two fields. So brackets go on exactly when there is a comma the
 * enclosing syntax would claim, and nowhere else, because `count: (state.count + 1)` reads
 * like the generator does not trust itself.
 *
 * Commas inside brackets and inside strings belong to those, which is what the scan
 * tracks. It is a scanner rather than a parser for `parseTemplate`'s reason: it has to be
 * total, and the failure it can have — brackets around something that did not need them —
 * is the harmless direction.
 */
export function embed(code: string): string {
  const trimmed = code.trim();
  return hasTopLevelComma(trimmed) ? `(${trimmed})` : trimmed;
}

function hasTopLevelComma(code: string): boolean {
  let depth = 0;

  for (let at = 0; at < code.length; at += 1) {
    const character = code[at]!;

    if (character === "'" || character === '"' || character === '`') {
      at = endOfString(code, at);
      continue;
    }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth -= 1;
    else if (character === ',' && depth === 0) return true;
  }

  return false;
}

/** The index of a string's closing quote, or the end of the source when it has none. */
function endOfString(code: string, start: number): number {
  const quote = code[start];
  let at = start + 1;
  while (at < code.length && code[at] !== quote) at += code[at] === '\\' ? 2 : 1;
  return at;
}

/** Text inside a template literal: the three sequences that would end it or start a hole. */
function templateText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/**
 * Template source as an expression producing exactly what the runtime would produce.
 *
 * The single-hole rule is `evaluateTemplate`'s, applied at generation time instead of at
 * render time: a hole standing alone keeps its type, so `{{ state.busy }}` on `disabled`
 * is a boolean rather than the string `"false"`. Mixed content is a template literal with
 * `text()` around each hole, which is `stringifyValue` — so an object interpolated into a
 * heading shows as JSON in the export exactly as it does on the canvas.
 */
export function templateExpression(source: string, helpers: Helpers): string {
  const only = singleExpressionOf(source);
  if (only !== null) return embed(only);

  const segments = parseTemplate(source);
  if (segments.every((segment) => segment.kind === 'text')) {
    return stringLiteral(
      segments.map((segment) => (segment.kind === 'text' ? segment.text : '')).join(''),
    );
  }

  const body = segments
    .map((segment) =>
      segment.kind === 'text'
        ? templateText(segment.text)
        : `\${${using(helpers, 'text')}(${embed(segment.code)})}`,
    )
    .join('');

  return `\`${body}\``;
}

/** Template source as an expression producing a *string*, whatever the holes evaluate to. */
export function textExpression(source: string, helpers: Helpers): string {
  return textCode(templateExpression(source, helpers), '', helpers);
}

/**
 * A stored prop as either a known value or code.
 *
 * This is `readProp` and `evaluateProp` collapsed into one answer, and it is the seam the
 * whole phase turns on: every caller that used to receive a `Json | undefined` now
 * receives this, and decides what to write for each side.
 */
export function emitProp(prop: PropValue | undefined, helpers: Helpers): Emitted {
  if (!prop) return { kind: 'static', value: undefined };
  if (prop.kind === 'static') return { kind: 'static', value: prop.value };
  return { kind: 'code', code: templateExpression(prop.code, helpers) };
}

/* -------------------------------------------------------------------------- */
/* The coercions, as code                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Each of these is the export's spelling of a coercion `expand.ts` performs directly when
 * the value is known. They are written as calls rather than inlined so that the exported
 * page reads as what it is — `pick(state.tone, ['default', 'muted'], 'default')` says
 * "this is an enum with a fallback" in a way a nested ternary does not — and so the two
 * implementations of each rule are one function apart rather than scattered through
 * generated strings.
 */

/**
 * `text()` around a value, except where it would do nothing.
 *
 * A template literal and a string literal are already strings and are never null, which is
 * all `text` decides — so wrapping one gives `text(\`Hi ${text(name)}\`, 'Text')`, which is
 * noise in a file someone is meant to read and edit.
 */
export function textCode(code: string, fallback: string, helpers: Helpers): string {
  if (code.startsWith('`') || code.startsWith("'")) return code;
  return `${using(helpers, 'text')}(${code}${fallback === '' ? '' : `, ${stringLiteral(fallback)}`})`;
}

export function truthyCode(code: string, fallback: boolean, helpers: Helpers): string {
  return `${using(helpers, 'truthy')}(${code}${fallback ? ', true' : ''})`;
}

export function numberCode(
  code: string,
  fallback: number,
  options: { round?: boolean; min?: number },
  helpers: Helpers,
): string {
  const parts = [code, String(fallback)];
  const shape: string[] = [];
  if (options.round === false) shape.push('round: false');
  if (options.min !== undefined) shape.push(`min: ${options.min}`);
  if (shape.length > 0) parts.push(`{ ${shape.join(', ')} }`);
  return `${using(helpers, 'num')}(${parts.join(', ')})`;
}

export function enumCode(
  code: string,
  options: readonly string[],
  fallback: string,
  helpers: Helpers,
): string {
  const allowed = options.map((option) => stringLiteral(option)).join(', ');
  return `${using(helpers, 'pick')}(${code}, [${allowed}], ${stringLiteral(fallback)})`;
}

export function initialsCode(code: string, helpers: Helpers): string {
  return `${using(helpers, 'initials')}(${code})`;
}

export function initialCode(code: string, or: string | null, helpers: Helpers): string {
  return `${using(helpers, 'initial')}(${code}${or === null ? '' : `, ${or}`})`;
}

/** What a `repeat` iterates — an array as itself, a count as that many indices. */
export function listCode(code: string, helpers: Helpers): string {
  return `${using(helpers, 'list')}(${code})`;
}

/** A class list joined at run time, for the one element whose caller contributes to it. */
export function classListCode(parts: readonly string[], helpers: Helpers): string {
  return `${using(helpers, 'cx')}(${parts.join(', ')})`;
}

/* -------------------------------------------------------------------------- */
/* Identifiers                                                                 */
/* -------------------------------------------------------------------------- */

function words(input: string): string[] {
  return input
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** 'Get started' -> 'GetStarted'. Empty when the name carries no letters or digits. */
export function pascalCase(input: string): string {
  return words(input)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join('');
}

/**
 * A handler's name — 'Get started' + 'onClick' -> 'onGetStartedClick'.
 *
 * From the layer name rather than the node id, because the point of hoisting a handler out
 * of its attribute is that someone reading the exported page can tell which control it
 * belongs to. Ids are opaque; the name is what the author typed in the layers tree.
 */
export function handlerName(nodeName: string, event: string): string {
  const subject = pascalCase(nodeName);
  const verb = pascalCase(event.replace(/^on/, '')) || 'Event';
  return `on${subject}${verb}`;
}

/** `count` when it is free, `count2` when it is not. Mutates `taken`. */
export function claimName(taken: Set<string>, base: string): string {
  const stem = base === '' ? 'value' : base;
  if (!taken.has(stem)) {
    taken.add(stem);
    return stem;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/**
 * Whether a handler's steps actually read `event`.
 *
 * It decides whether the generated arrow takes a parameter at all, and it has to be right
 * in both directions: the exported project sets `noUnusedParameters`, so a parameter
 * nobody reads fails its build, and a missing one fails to compile where it is used.
 * String literals and comments are stripped first — `showToast 'saved the event'` must not
 * count — and a leading dot excludes `state.event`, which is a variable and not the event.
 */
export function readsEvent(sources: readonly string[]): boolean {
  return sources.some((source) => /(?<![.\w$])event\b/.test(stripLiterals(source)));
}

/** Quoted runs and comments blanked out, so a scan sees only code. */
function stripLiterals(source: string): string {
  let out = '';
  let at = 0;

  while (at < source.length) {
    const character = source[at]!;

    if (character === "'" || character === '"' || character === '`') {
      const quote = character;
      at += 1;
      while (at < source.length && source[at] !== quote) {
        at += source[at] === '\\' ? 2 : 1;
      }
      at += 1;
      continue;
    }

    if (character === '/' && (source[at + 1] === '/' || source[at + 1] === '*')) {
      const end =
        source[at + 1] === '/'
          ? source.indexOf('\n', at)
          : (() => {
              const close = source.indexOf('*/', at + 2);
              return close === -1 ? -1 : close + 2;
            })();
      at = end === -1 ? source.length : end;
      continue;
    }

    out += character;
    at += 1;
  }

  return out;
}
