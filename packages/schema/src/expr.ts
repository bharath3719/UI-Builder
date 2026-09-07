/**
 * Expressions — PLAN.md §10.
 *
 * This module owns everything about a binding *except* running it. There is no
 * `new Function` here and there must never be one: `@ui-builder/schema` is imported by
 * the studio, the API and the code generator, and §13's mitigation for expression
 * footguns is that user code evaluates only inside the canvas iframe. Making the
 * package that cannot eval the package that defines evaluation is what turns that rule
 * from a convention into a fact about the module graph — `evaluateTemplate` takes the
 * evaluator as an argument, so the one caller that can supply it is the one realm
 * allowed to.
 *
 * What lives here is the part the canvas, the preview, the export and the inspector
 * must all agree on: where the holes in a string are, what a hole standing alone means,
 * how a value becomes text, and what counts as a name.
 */

import type {
  Json,
  Node,
  NodeTree,
  Page,
  PropValue,
  QueryDef,
  StateVar,
  SymbolDef,
  SymbolProp,
  Theme,
} from './doc.js';

/* -------------------------------------------------------------------------- */
/* The render scope                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What a query looks like from an expression.
 *
 * The three fields travel together rather than the payload alone because a list that
 * has to say "loading" cannot say it from the rows, and a page that has to show an
 * error cannot show it from an empty array.
 */
export interface QueryState {
  loading: boolean;
  data: Json | undefined;
  error: string | undefined;
}

/**
 * The names an expression may use. Identical in the canvas, the preview and the
 * exported project — which is what lets the *same expression text* be evaluated by the
 * runtime and printed verbatim into generated code, with no rewriting step that could
 * disagree with itself (D6, applied to bindings rather than to CSS).
 */
export interface RenderScope {
  state: Record<string, Json>;
  queries: Record<string, QueryState>;
  /**
   * The enclosing symbol's props (§12) — what an instance passed in, already evaluated
   * against the scope the *instance* sat in.
   *
   * Empty on a page, which has no enclosing component. Inside a symbol it is the whole of
   * what flows in: `state` and `queries` are the page's and a symbol has neither, which is
   * what keeps a reusable component from depending on where it was dropped.
   */
  props: Record<string, Json>;
  theme: Theme;
  /** Present only inside a `repeat`. Nested repeats shadow, as `.map()` nesting does. */
  item?: Json;
  index?: number;
}

/** The roots of the scope — what autocomplete offers and what a hole may start with. */
export const SCOPE_ROOTS = ['state', 'queries', 'props', 'theme', 'item', 'index'] as const;

export type ScopeRoot = (typeof SCOPE_ROOTS)[number];

/**
 * What an *action's* expressions see: everything a render sees, plus the event.
 *
 * `event` is the only name that exists in a handler and nowhere else, and it is the one
 * that makes an input writable — `setState text = {{ event.target.value }}` is the whole
 * of "bind this field to a variable". It is `unknown` rather than `Json` because it is a
 * live DOM event, and it is called `event` because that is what the generated handler's
 * parameter is called, so the same expression text works in both (see `RenderScope`).
 */
export interface ActionScope extends RenderScope {
  event?: unknown;
}

/** The roots an action's expressions may start with. Offered only where one is edited. */
export const ACTION_SCOPE_ROOTS = [...SCOPE_ROOTS, 'event'] as const;

export type ActionScopeRoot = (typeof ACTION_SCOPE_ROOTS)[number];

/** Supplied by the runtime; see the module note above for why it is not supplied here. */
export type EvaluateExpression = (code: string) => unknown;

/* -------------------------------------------------------------------------- */
/* Template parsing                                                            */
/* -------------------------------------------------------------------------- */

export const OPEN = '{{';
export const CLOSE = '}}';

export type TemplateSegment = { kind: 'text'; text: string } | { kind: 'expr'; code: string };

/**
 * Splits template source into literal text and holes.
 *
 * Total by construction: an unterminated `{{` is literal text, not an error. A field is
 * parsed on every keystroke to decide what to show, and half a typed expression must
 * not blank the canvas.
 *
 * The scanner is deliberately naive — the first `}}` closes the hole, even inside a
 * string literal. `{{ label || '}}' }}` therefore does not work, and the escape for a
 * literal `{{` in an expression-valued field is `{{ '{{' }}`, which falls out of holes
 * being JavaScript. Both are cheap to live with; a scanner that tracked quoting would
 * be a partial JavaScript lexer that still could not handle a nested template literal.
 */
export function parseTemplate(source: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let at = 0;

  while (at < source.length) {
    const open = source.indexOf(OPEN, at);
    if (open === -1) break;

    const close = source.indexOf(CLOSE, open + OPEN.length);
    if (close === -1) break;

    if (open > at) segments.push({ kind: 'text', text: source.slice(at, open) });
    segments.push({ kind: 'expr', code: source.slice(open + OPEN.length, close).trim() });
    at = close + CLOSE.length;
  }

  if (at < source.length) segments.push({ kind: 'text', text: source.slice(at) });
  return segments;
}

/** Whether the source contains at least one complete hole. */
export function hasInterpolation(source: string): boolean {
  return parseTemplate(source).some((segment) => segment.kind === 'expr');
}

/**
 * The code of the one hole, when the source is a hole and nothing else.
 *
 * This is the rule that makes a boolean prop bindable. `{{ state.busy }}` on `disabled`
 * has to yield `false`, not the string `"false"` — which is truthy, and would disable
 * every button whose expression said not to. Mixed content is a string by definition,
 * so it is only the standalone case that can preserve a type.
 */
export function singleExpressionOf(source: string): string | null {
  const segments = parseTemplate(source);
  const first = segments[0];
  if (segments.length !== 1 || first === undefined || first.kind !== 'expr') return null;
  return first.code;
}

export type TemplateProblem = { ok: true } | { ok: false; message: string };

/**
 * What the inspector shows under a field in red. Structural only — whether the holes
 * are closed and non-empty. Whether the JavaScript inside one parses is a question only
 * the evaluator's realm can answer, and it answers it by failing the node rather than
 * the page.
 */
export function validateTemplate(source: string): TemplateProblem {
  let at = 0;

  while (at < source.length) {
    const open = source.indexOf(OPEN, at);
    if (open === -1) break;

    const close = source.indexOf(CLOSE, open + OPEN.length);
    if (close === -1) return { ok: false, message: 'This expression is missing its closing }}.' };

    const code = source.slice(open + OPEN.length, close).trim();
    if (code === '') return { ok: false, message: 'This expression is empty.' };
    if (code.includes(OPEN)) return { ok: false, message: 'Expressions cannot be nested.' };

    at = close + CLOSE.length;
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Evaluation — the shape of it, not the doing of it                           */
/* -------------------------------------------------------------------------- */

/**
 * How an evaluated value becomes text when it is one hole among several.
 *
 * `null` and `undefined` render as nothing rather than as their own names: a heading
 * bound to a field that has not loaded yet should be empty, not the word "undefined".
 * Objects go through JSON so that a mistake is visible — an interpolated `[object
 * Object]` tells the author nothing about what they actually bound.
 */
export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value) ?? '';
  } catch {
    // Circular, or something with a throwing `toJSON`. Both are authoring mistakes and
    // neither is worth taking the render down for.
    return '';
  }
}

/**
 * Runs template source against a supplied evaluator.
 *
 * The single-hole rule (above) is applied here, once, so the canvas cannot disagree
 * with the preview about whether a bound `disabled` is a boolean or a string.
 */
export function evaluateTemplate(source: string, evaluate: EvaluateExpression): unknown {
  const only = singleExpressionOf(source);
  if (only !== null) return evaluate(only);

  let out = '';
  for (const segment of parseTemplate(source)) {
    out += segment.kind === 'text' ? segment.text : stringifyValue(evaluate(segment.code));
  }
  return out;
}

/**
 * Reads a prop, running it if it is bound.
 *
 * Returns `unknown` rather than `Json` because an expression can produce anything —
 * a function, a DOM node someone reached for, `NaN`. Every consumer already narrows
 * through the coercions in `@ui-builder/components` (`asString`, `asBoolean`, `asEnum`),
 * which is the right place for it: they are the same coercions the export applies, so
 * a bound prop and a literal one land on a screen the same way.
 */
export function evaluateProp(prop: PropValue | undefined, evaluate: EvaluateExpression): unknown {
  if (!prop) return undefined;
  return prop.kind === 'static' ? prop.value : evaluateTemplate(prop.code, evaluate);
}

/** The truthiness test behind `showIf` and behind a conditional in an action. */
export function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

/** Convenience mirror of `staticProp` for the side that binds. */
export function exprProp(code: string): PropValue {
  return { kind: 'expr', code };
}

/* -------------------------------------------------------------------------- */
/* Names                                                                       */
/* -------------------------------------------------------------------------- */

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Whether a state variable or query may be called this.
 *
 * Identifier-shaped only. Reserved words are deliberately allowed: access is always
 * namespaced (`state.class`, `queries.default`), and a property name after a dot is
 * legal for every one of them — so rejecting them would be a rule the language does not
 * have. Codegen keeps that true by emitting one `state` object rather than a variable
 * per name.
 */
export function isValidVarName(name: string): boolean {
  return IDENTIFIER.test(name);
}

/**
 * A typed label turned into something usable as a name — `User list` -> `userList`.
 *
 * Applied when a variable is created, never as the user types: rewriting a field under
 * someone mid-word is how a name ends up as `usernam`.
 */
export function toVarName(input: string): string {
  const words = input
    .replace(/[^A-Za-z0-9_$]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');

  if (words.length === 0) return '';

  const [first, ...rest] = words as [string, ...string[]];
  const joined =
    first.toLowerCase() + rest.map((word) => word[0]!.toUpperCase() + word.slice(1)).join('');

  return IDENTIFIER.test(joined) ? joined : `_${joined}`;
}

/**
 * A typed label turned into a component name — `user card` -> `UserCard`.
 *
 * `toVarName`'s sibling, one case up. It lives here rather than in `codegen`, which is
 * where it was first needed, because a symbol's spec has to derive the same name to put
 * in `codegen.tag` and `components` cannot import `codegen` (PLAN.md §2). A leading digit
 * is legal in a file name and not in an identifier, and the two have to stay the same word
 * or the generated import breaks.
 */
export function toComponentName(input: string, fallback = 'Component'): string {
  const parts = input.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = parts.map((part) => part[0]!.toUpperCase() + part.slice(1)).join('');
  if (joined === '') return fallback;
  return /^[0-9]/.test(joined) ? `${fallback}${joined}` : joined;
}

/**
 * A name turned into the label a panel shows for it — `imageUrl` -> `Image url`.
 *
 * `toVarName`'s inverse, near enough. It exists so a symbol's props are labelled the way
 * the library's are ("Text", "Level") rather than in the identifier case they are read by,
 * and so that renaming a prop moves the label with it while the author has not written one
 * of their own.
 */
export function toPropLabel(name: string): string {
  const spaced = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();

  return spaced === '' ? '' : spaced[0]!.toUpperCase() + spaced.slice(1);
}

/** `count` -> `count2` when `count` is taken. */
export function uniqueVarName(taken: Iterable<string>, base: string): string {
  const used = new Set(taken);
  const stem = isValidVarName(base) ? base : toVarName(base) || 'value';
  if (!used.has(stem)) return stem;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/* -------------------------------------------------------------------------- */
/* Reading a document for what it references                                   */
/* -------------------------------------------------------------------------- */

const SCOPE_ACCESS = /\b(state|queries|props|theme)\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;

/**
 * Which of the two things a string is.
 *
 * `template` is a value with `{{ }}` holes in it — a prop, a URL, an action's argument.
 * `code` is a `custom` step's body: statements, evaluated as written, with no holes to
 * find. Everything that reads expressions has to know which it is holding, so the
 * distinction travels on the site rather than being guessed at from the content.
 */
export type ExpressionForm = 'template' | 'code';

function scanForScope(code: string, found: Set<string>): void {
  for (const match of code.matchAll(SCOPE_ACCESS)) found.add(`${match[1]}.${match[2]}`);
}

/**
 * The scope paths a string reads — `['state.count', 'queries.users']`.
 *
 * A conservative textual scan, not an analysis: it sees `state.count` and misses
 * `state['count']`, and it would report a path that appears inside a string literal.
 * That is sound for everything it is used for — telling the author which variables a
 * page actually uses, and warning before a rename — and it is explicitly *not* used to
 * rewrite anything. Nothing rewrites expression text; the generated code defines the
 * same names instead, so the text is portable as written.
 */
export function referencedScopePaths(source: string, form: ExpressionForm = 'template'): string[] {
  const found = new Set<string>();

  if (form === 'code') {
    scanForScope(source, found);
  } else {
    for (const segment of parseTemplate(source)) {
      if (segment.kind === 'expr') scanForScope(segment.code, found);
    }
  }

  return [...found].sort();
}

/** The names a source reads under one root, without the root. */
export function referencedNames(
  source: string,
  root: ScopeRoot,
  form: ExpressionForm = 'template',
): string[] {
  const prefix = `${root}.`;
  return referencedScopePaths(source, form)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length));
}

/** Where a piece of expression source was found, for error messages and usage lists. */
export interface ExpressionSite {
  source: string;
  form: ExpressionForm;
  nodeId?: string;
  /** 'props.label', 'showIf', 'repeat.over', 'events.onClick[0].value', 'queries.users.url' */
  path: string;
}

function collectFromNode(node: Node): ExpressionSite[] {
  const sites: ExpressionSite[] = [];
  const bound = (prop: PropValue | undefined, path: string): void => {
    if (prop?.kind === 'expr') {
      sites.push({ source: prop.code, form: 'template', nodeId: node.id, path });
    }
  };

  for (const [name, prop] of Object.entries(node.props)) bound(prop, `props.${name}`);
  bound(node.showIf, 'showIf');
  bound(node.repeat?.over, 'repeat.over');

  for (const [event, steps] of Object.entries(node.events)) {
    steps.forEach((step, index) => {
      const at = `events.${event}[${index}]`;
      if (step.kind === 'setState') bound(step.value, `${at}.value`);
      else if (step.kind === 'navigate') bound(step.to, `${at}.to`);
      else if (step.kind === 'showToast') bound(step.message, `${at}.message`);
      else if (step.kind === 'custom') {
        sites.push({ source: step.code, form: 'code', nodeId: node.id, path: `${at}.code` });
      }
    });
  }

  return sites;
}

/**
 * Every piece of template source on a page, wherever it hides.
 *
 * One walk that everything asking "what uses this?" can share — the state panel's usage
 * count, the warning before a delete, and the check that a query's URL does not read a
 * variable that no longer exists. Written once because the list of places an expression
 * can live grows (it grew twice while this was being written) and three copies of the
 * walk would each miss a different one.
 *
 * A query's `url`, `body` and header values are plain strings that happen to be
 * templates, so they are included: `{{ state.userId }}` in a URL is exactly as much a
 * reference as one in a prop.
 */
export function collectTreeExpressions(tree: NodeTree): ExpressionSite[] {
  return Object.values(tree.nodes).flatMap((node) => collectFromNode(node));
}

export function collectExpressions(page: Page): ExpressionSite[] {
  const sites: ExpressionSite[] = collectTreeExpressions(page);

  for (const query of page.queries) {
    sites.push({ source: query.url, form: 'template', path: `queries.${query.name}.url` });
    if (query.body !== undefined) {
      sites.push({ source: query.body, form: 'template', path: `queries.${query.name}.body` });
    }
    for (const [header, value] of Object.entries(query.headers ?? {})) {
      sites.push({
        source: value,
        form: 'template',
        path: `queries.${query.name}.headers.${header}`,
      });
    }
  }

  return sites;
}

/**
 * The queries that read their own result, directly or through another query.
 *
 * Such a query cannot be run automatically: its result changes its request, which runs it
 * again. That is the concrete form of §13's "infinite loops" risk, and it is cheap to
 * refuse statically — the alternative is a fetch loop that the author sees as a hung
 * canvas and a stranger sees as traffic. Running one by hand from an action is still
 * allowed; a person clicking a button is not a loop.
 *
 * It lives here rather than in the runtime because three things have to agree about it:
 * the Data panel, which says so in the editor; the runtime, which declines to auto-run
 * one; and codegen, which emits it with `runOnLoad: false`. An exported project that
 * looped where the canvas did not would be the worst of the three places to find out.
 */
export function cyclicQueries(queries: readonly QueryDef[]): ReadonlySet<string> {
  const idByName = new Map(queries.map((query) => [query.name, query.id]));

  const dependencies = new Map<string, string[]>();
  for (const query of queries) {
    const sources = [query.url, query.body ?? '', ...Object.values(query.headers ?? {})];
    const names = new Set(sources.flatMap((source) => referencedNames(source, 'queries')));
    dependencies.set(
      query.id,
      [...names].map((name) => idByName.get(name)).filter((id) => id !== undefined),
    );
  }

  const cyclic = new Set<string>();
  for (const query of queries) {
    const seen = new Set<string>();
    const pending = [...(dependencies.get(query.id) ?? [])];

    while (pending.length > 0) {
      const next = pending.pop()!;
      if (next === query.id) {
        cyclic.add(query.id);
        break;
      }
      if (seen.has(next)) continue;
      seen.add(next);
      pending.push(...(dependencies.get(next) ?? []));
    }
  }

  return cyclic;
}

/**
 * Where a state variable is used, by name.
 *
 * By name rather than by id because that is how expressions reach it — an action step
 * holds an id and survives a rename, an expression holds text and does not. The panel
 * needs both answers and this is the one it cannot get from the ids.
 */
export function stateVarUsage(page: Page, variable: StateVar): ExpressionSite[] {
  return collectExpressions(page).filter((site) =>
    referencedNames(site.source, 'state', site.form).includes(variable.name),
  );
}

/**
 * Where a symbol's prop is read, by name, inside the symbol itself.
 *
 * `stateVarUsage` one level down, and for the same reason: an instance's stored value
 * moves with a rename because it is keyed data, but `{{ props.title }}` inside the
 * component is text that nothing may rewrite. This is what the panel warns with before a
 * rename lands.
 */
export function symbolPropUsage(symbol: SymbolDef, prop: SymbolProp): ExpressionSite[] {
  return collectTreeExpressions(symbol).filter((site) =>
    referencedNames(site.source, 'props', site.form).includes(prop.name),
  );
}
