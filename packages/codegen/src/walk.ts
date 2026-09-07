/**
 * A node tree -> the JSX IR for it, plus the statements its handlers need.
 *
 * Split out of `page.ts` when symbols arrived (PLAN.md §12), because a page and a symbol
 * are the same walk over different trees: both turn nodes into elements through the emit
 * templates, both hoist handlers into named functions, both collect the modules and helpers
 * the result reaches for. What they do *not* share is the preamble — a page declares state
 * and queries, a symbol declares its props — so that stays with each of them.
 *
 * There is one copy of `walkNode` for the reason there is one copy of `moveNode`: two that
 * agree today are two that stop agreeing the first time one is fixed, and an export that
 * rendered a component differently inside a symbol than on a page would be exactly the
 * failure D6 exists to prevent.
 */

import { specFor, type ComponentSpec, type EmitModule } from '@ui-builder/components';
import {
  isTruthy,
  nodeClassName,
  stringifyValue,
  symbolIdOf,
  type ActionStep,
  type Json,
  type Node,
  type NodeTree,
  type PropValue,
  type QueryDef,
  type StateVar,
  type SymbolDef,
} from '@ui-builder/schema';
import { expandElement, type ExpandContext } from './expand.js';
import {
  element,
  printJsx,
  stringLiteral,
  type JsxAttr,
  type JsxElement,
  type JsxNode,
} from './ir.js';
import {
  claimName,
  emitProp,
  handlerName,
  listCode,
  numberCode,
  readsEvent,
  textCode,
  textExpression,
  truthyCode,
  type Helpers,
} from './values.js';

/* -------------------------------------------------------------------------- */
/* Literals                                                                    */
/* -------------------------------------------------------------------------- */

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** An object key, quoted only where it has to be. */
export function objectKey(name: string): string {
  return IDENTIFIER.test(name) ? name : stringLiteral(name);
}

/** Whether a name can be written as `x.name` rather than `x['name']`. */
export function isIdentifier(name: string): boolean {
  return IDENTIFIER.test(name);
}

/**
 * A stored value as the JavaScript that reproduces it.
 *
 * `JSON.stringify` would do this in one line and in double quotes, which is the one thing
 * the rest of the generated file never uses — a page's own literals should look like the
 * rest of its code rather than like a payload.
 */
export function jsonLiteral(value: Json | undefined): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return stringLiteral(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => jsonLiteral(item)).join(', ')}]`;

  const entries = Object.entries(value).map(
    ([key, held]) => `${objectKey(key)}: ${jsonLiteral(held)}`,
  );
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

/** A one-line object literal, or one field per line when that line would be too long. */
export function objectLiteral(fields: string[], indent: string): string {
  const inline = `{ ${fields.join(', ')} }`;
  if (fields.length === 0) return '{}';
  if (indent.length + inline.length <= 96) return inline;
  return `{\n${fields.map((field) => `${indent}  ${field},`).join('\n')}\n${indent}}`;
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The React event type a handler's parameter takes.
 *
 * Known from the element the handler lands on, which the generator has just decided, so
 * `event.target.value` on an input typechecks in the exported project rather than needing
 * a cast. A name outside the table gets `SyntheticEvent`, which every event is one of.
 */
const EVENT_TYPES: Record<string, string> = {
  onClick: 'MouseEvent',
  onChange: 'ChangeEvent',
  onInput: 'FormEvent',
  onSubmit: 'FormEvent',
  onFocus: 'FocusEvent',
  onBlur: 'FocusEvent',
  onKeyDown: 'KeyboardEvent',
  onKeyUp: 'KeyboardEvent',
};

const ELEMENT_TYPES: Record<string, string> = {
  a: 'HTMLAnchorElement',
  button: 'HTMLButtonElement',
  form: 'HTMLFormElement',
  input: 'HTMLInputElement',
  label: 'HTMLLabelElement',
  select: 'HTMLSelectElement',
  textarea: 'HTMLTextAreaElement',
};

/**
 * A symbol, and the name the project settled on for it.
 *
 * The name is decided once per document, because two symbols may legitimately be called
 * the same thing and two files may not — `symbolSpec`'s own `codegen.tag` is what the name
 * would be if it were the only one, and this is what it actually is.
 */
export interface SymbolTarget {
  symbol: SymbolDef;
  /** The exported component, the file stem, and the CSS Module's base name. */
  name: string;
}

export interface Walk {
  /** The nodes being walked — a page's, or one symbol's. */
  tree: NodeTree;
  /** Page state. Empty inside a symbol, which has none by design (§12). */
  state: readonly StateVar[];
  queries: readonly QueryDef[];
  /** Every symbol in the document, so an instance can be emitted as its component. */
  symbols: readonly SymbolTarget[];
  warnings: string[];
  /** Node ids whose styles produced at least one rule. */
  styled: Set<string>;
  /**
   * Whether a node that was actually emitted referenced the stylesheet. Tracked rather
   * than inferred from `styled`, because a page whose only styled node is hidden would
   * otherwise get an import it never uses — which the generated project's own
   * `noUnusedLocals` would reject.
   */
  usedStyles: boolean;
  /** Collected as the walk goes; a page cannot know what it imports until it is walked. */
  modules: Set<EmitModule>;
  /** The symbol components this tree turned out to place. */
  placed: Set<SymbolTarget>;
  helpers: Helpers;
  /** Every binding the component body declares, so a second handler cannot shadow the first. */
  names: Set<string>;
  /** React type names the handlers' parameters are annotated with. */
  eventTypes: Set<string>;
  needsToasts: boolean;
  needsGoTo: boolean;
  /** Passed to the root element's `className`. See `ExpandContext.rootExtraClass`. */
  rootExtraClass?: string;
}

export function createWalk(init: Partial<Walk> & Pick<Walk, 'tree'>): Walk {
  return {
    tree: init.tree,
    state: init.state ?? [],
    queries: init.queries ?? [],
    symbols: init.symbols ?? [],
    warnings: init.warnings ?? [],
    styled: init.styled ?? new Set(),
    usedStyles: false,
    modules: new Set(),
    placed: new Set(),
    helpers: new Set(),
    names: new Set(),
    eventTypes: new Set(),
    needsToasts: false,
    needsGoTo: false,
    ...(init.rootExtraClass === undefined ? {} : { rootExtraClass: init.rootExtraClass }),
  };
}

/** A step's text argument — a path to go to, a message to show. */
function textOfProp(prop: PropValue, helpers: Helpers): string {
  if (prop.kind === 'static') return stringLiteral(stringifyValue(prop.value));
  return textExpression(prop.code, helpers);
}

/**
 * One action step as the statements it runs.
 *
 * A closed union of six, which is what §10 promised would keep the generated handler
 * readable: this is a translation, not an interpreter shipped to the user. A step naming
 * something that has since been deleted emits nothing and says so — the runtime reports
 * the same thing to the console, and an export has no console anyone is watching.
 */
function stepStatements(step: ActionStep, node: Node, event: string, walk: Walk): string[] {
  const where = `"${node.name}" (${node.id}) · ${event}`;

  switch (step.kind) {
    case 'setState': {
      const variable = walk.state.find((candidate) => candidate.id === step.stateId);
      if (!variable) {
        walk.warnings.push(`${where}: sets a variable that no longer exists — step dropped.`);
        return [];
      }
      const value = emitProp(step.value, walk.helpers);
      const code = value.kind === 'code' ? value.code : jsonLiteral(value.value);
      return [`setState((current) => ({ ...current, ${objectKey(variable.name)}: ${code} }));`];
    }

    case 'toggleState': {
      const variable = walk.state.find((candidate) => candidate.id === step.stateId);
      if (!variable) {
        walk.warnings.push(`${where}: toggles a variable that no longer exists — step dropped.`);
        return [];
      }
      // Read from `current` rather than from the render's `state`, so two toggles in one
      // handler are two flips. That is the reducer's rule in the runtime, kept here by
      // using the updater form.
      const held = `current${isIdentifier(variable.name) ? `.${variable.name}` : `[${stringLiteral(variable.name)}]`}`;
      return [
        `setState((current) => ({ ...current, ${objectKey(variable.name)}: !${truthyCode(held, false, walk.helpers)} }));`,
      ];
    }

    case 'runQuery': {
      const query = walk.queries.find((candidate) => candidate.id === step.queryId);
      if (!query) {
        walk.warnings.push(`${where}: runs a query that no longer exists — step dropped.`);
        return [];
      }
      // Awaited, so a step after it happens after the request rather than beside it. That
      // ordering is the only reason a step list is sequential at all.
      return [`await queries.${objectKey(query.name)}.run();`];
    }

    case 'navigate':
      walk.needsGoTo = true;
      return [`goTo(${textOfProp(step.to, walk.helpers)});`];

    case 'showToast':
      walk.needsToasts = true;
      return [`showToast(${textOfProp(step.message, walk.helpers)});`];

    case 'custom':
      // The author's own JavaScript, written out as they typed it. Nothing here parses or
      // rewrites it — see the note in `values.ts` about why expression text is portable.
      return step.code.split('\n');
  }
}

/** The source of every expression a step carries, for the `event` scan. */
function stepSources(steps: readonly ActionStep[]): string[] {
  return steps.flatMap((step) => {
    if (step.kind === 'custom') return [step.code];
    if (step.kind === 'setState') return step.value.kind === 'expr' ? [step.value.code] : [];
    if (step.kind === 'navigate') return step.to.kind === 'expr' ? [step.to.code] : [];
    if (step.kind === 'showToast') return step.message.kind === 'expr' ? [step.message.code] : [];
    return [];
  });
}

/**
 * A node's handlers, declared as named functions and referenced from its attributes.
 *
 * Named rather than written inline, because a multi-step handler inside an attribute is
 * the thing that makes generated JSX unreadable — and because the name says which control
 * it belongs to. They are declared in `statements`, which is the component body for most
 * nodes and the `.map()` callback for anything inside a `repeat`: a handler there closes
 * over the `item` its copy was rendered for, and hoisting it past the map would lose
 * exactly the fact that makes "remove this row" mean a row.
 */
function emitHandlers(
  node: Node,
  spec: ComponentSpec,
  tag: string,
  walk: Walk,
  statements: string[],
): Array<{ name: string; code: string }> {
  const attrs: Array<{ name: string; code: string }> = [];

  // Only events the *spec* declares, so a document cannot make the generator write an
  // arbitrary prop onto an element by naming it in `events` (D7).
  for (const event of spec.events) {
    const steps = node.events[event];
    if (!steps || steps.length === 0) continue;

    const body = steps.flatMap((step) => stepStatements(step, node, event, walk));
    if (body.length === 0) continue;

    const name = claimName(walk.names, handlerName(node.name, event));
    const asynchronous = body.some((line) => line.startsWith('await '));

    let parameter = '';
    if (readsEvent(stepSources(steps))) {
      const eventType = EVENT_TYPES[event] ?? 'SyntheticEvent';
      walk.eventTypes.add(eventType);
      parameter = `event: ${eventType}<${ELEMENT_TYPES[tag] ?? 'HTMLElement'}>`;
    }

    statements.push(
      `const ${name} = ${asynchronous ? 'async ' : ''}(${parameter}) => {\n${body
        .map((line) => (line === '' ? '' : `  ${line}`))
        .join('\n')}\n};`,
    );

    attrs.push({ name: event, code: name });
  }

  return attrs;
}

/* -------------------------------------------------------------------------- */
/* Symbol instances                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One instance's prop, as the attribute the component receives.
 *
 * A stored literal is written as the literal. A binding is written with the coercion
 * around it that `coerceToProp` applies on the canvas — `text`, `num` and `truthy` are the
 * export's copies of `stringifyValue`, `Number` and `isTruthy`, which is what keeps a bound
 * prop meaning the same in both (D6). A prop the instance has no value for is *omitted*,
 * because the component's own parameter default is the same `?? defaultValue` the runtime
 * applies — written once, in one place, rather than at every placement.
 */
function instanceAttr(node: Node, symbol: SymbolDef, name: string, walk: Walk): JsxAttr | null {
  const prop = symbol.props.find((candidate) => candidate.name === name);
  if (!prop) return null;

  const stored = node.props[name];
  if (!stored) return null;

  if (stored.kind === 'static') {
    const value = stored.value;
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? { name, kind: 'bare' } : null;
    if (typeof value === 'number') return { name, kind: 'expr', code: String(value) };
    if (typeof value === 'string') return { name, kind: 'string', value };
    return { name, kind: 'expr', code: jsonLiteral(value) };
  }

  const code = emitProp(stored, walk.helpers);
  if (code.kind !== 'code') return null;

  switch (prop.type) {
    case 'number':
      // `round: false` because `coerceToProp` does not round: a symbol's number prop is
      // whatever the expression produced, and rounding it here would show one value on the
      // canvas and another in the export.
      return {
        name,
        kind: 'expr',
        code: numberCode(
          code.code,
          typeof prop.defaultValue === 'number' ? prop.defaultValue : 0,
          { round: false },
          walk.helpers,
        ),
      };
    case 'boolean':
      return {
        name,
        kind: 'expr',
        code: truthyCode(code.code, prop.defaultValue === true, walk.helpers),
      };
    default:
      return {
        name,
        kind: 'expr',
        code: textCode(
          code.code,
          typeof prop.defaultValue === 'string' ? prop.defaultValue : '',
          walk.helpers,
        ),
      };
  }
}

/**
 * An instance as `<ProductCard className={…} title="…" />`.
 *
 * No children: what is inside a symbol belongs to the symbol, so the instance node has
 * none to emit. The class is the instance's own rules, handed to the component, which
 * wears it on the element its root renders — the wrapper element this avoids would be a
 * box in the middle of someone's layout that exists only because the builder needed
 * somewhere to hang it (see `classAttr` in `expand.ts`).
 */
function walkInstance(node: Node, symbolId: string, walk: Walk): JsxNode | null {
  const target = walk.symbols.find((candidate) => candidate.symbol.id === symbolId);
  if (!target) {
    walk.warnings.push(
      `Skipped "${node.name}" (${node.id}): no component in this project with id "${symbolId}".`,
    );
    return null;
  }

  walk.placed.add(target);

  const attrs: JsxAttr[] = [];
  if (walk.styled.has(node.id)) {
    attrs.push({
      name: 'className',
      kind: 'expr',
      code: `styles[${stringLiteral(nodeClassName(node.id))}]`,
    });
    walk.usedStyles = true;
  }

  for (const prop of target.symbol.props) {
    const attr = instanceAttr(node, target.symbol, prop.name, walk);
    if (attr) attrs.push(attr);
  }

  return element(target.name, attrs);
}

/* -------------------------------------------------------------------------- */
/* The walk                                                                    */
/* -------------------------------------------------------------------------- */

/** The element a node's handlers and `key` land on, past any condition wrapping it. */
function elementOf(node: JsxNode): JsxElement | null {
  if (node.kind === 'element') return node;
  if (node.kind === 'when') return elementOf(node.child);
  return null;
}

/**
 * A node and its subtree as JSX, or null when it renders nothing.
 *
 * `hidden` returns null here for the same reason it does in `PageRenderer`: a hidden
 * node is not part of the page, and an export that shipped it as markup nobody can see
 * would be a different page from the one on the canvas. `showIf` and `repeat` do *not*:
 * they are the data talking rather than the author, so they become a condition and a map
 * that the page itself decides, which is what makes the export match the preview instead
 * of matching the canvas's editing view.
 */
export function walkNode(
  id: string,
  walk: Walk,
  statements: string[],
  root = false,
): JsxNode | null {
  const node: Node | undefined = walk.tree.nodes[id];
  if (!node || node.hidden) return null;

  const symbolId = symbolIdOf(node.type);

  const spec = specFor(
    node.type,
    walk.symbols.map((target) => target.symbol),
  );
  if (!spec) {
    // The runtime draws a red box so the node stays selectable and deletable. An export
    // has no inspector to rescue it in, so the honest thing is to leave it out and say
    // so — silently emitting nothing is what would cost someone an afternoon.
    //
    // Which of the two it is matters to whoever reads the warning: a missing library
    // component means the builder changed under a stored document, and a missing symbol
    // means something in this project was deleted while an instance still pointed at it.
    walk.warnings.push(
      symbolId === null
        ? `Skipped "${node.name}" (${node.id}): no component named "${node.type}" in the library.`
        : `Skipped "${node.name}" (${node.id}): no component in this project with id "${symbolId}".`,
    );
    return null;
  }

  // Answered before anything below it is walked, because a node the document already
  // rules out has no children to emit and no handlers to declare — and a handler declared
  // for markup that was then dropped is an unused binding the export would not compile.
  const showIf = node.showIf ? emitProp(node.showIf, walk.helpers) : null;
  if (showIf?.kind === 'static' && !isTruthy(showIf.value)) return null;

  // A repeated node opens a scope: everything from here down is inside the callback, and
  // the handlers written there close over its `item`.
  const inner = node.repeat ? [] : statements;

  let expanded: JsxNode | null;

  if (symbolId !== null) {
    expanded = walkInstance(node, symbolId, walk);
  } else {
    const children = spec.acceptsChildren
      ? node.children.flatMap((childId) => {
          const child = walkNode(childId, walk, inner);
          return child ? [child] : [];
        })
      : [];

    let styleExpr: string | null = null;
    if (walk.styled.has(node.id)) {
      styleExpr = `styles[${stringLiteral(nodeClassName(node.id))}]`;
      walk.usedStyles = true;
    }

    const context: ExpandContext = {
      node,
      styleExpr,
      children,
      modules: walk.modules,
      helpers: walk.helpers,
      warnings: walk.warnings,
      ...(root && walk.rootExtraClass ? { rootExtraClass: walk.rootExtraClass } : {}),
    };

    const template = spec.codegen.emit ?? {
      tag: spec.codegen.tag,
      children: spec.acceptsChildren ? [{ slot: true as const }] : [],
    };

    expanded = expandElement(template, context, true);
  }

  if (!expanded) return null;

  const element_ = elementOf(expanded);
  if (element_) {
    for (const handler of emitHandlers(node, spec, element_.tag, walk, inner)) {
      element_.attrs.push({ name: handler.name, kind: 'expr', code: handler.code });
    }
  }

  let out: JsxNode = expanded;

  // The document's own condition wraps whatever the template produced, including a
  // condition the template had of its own — the two are different questions and both can
  // be true at once.
  // A condition the document already answers was answered above; only a bound one reaches
  // the page, as the `&&` §12 asked for.
  if (showIf?.kind === 'code') {
    out = { kind: 'when', test: truthyCode(showIf.code, false, walk.helpers), child: out };
  }

  if (node.repeat) {
    const over = emitProp(node.repeat.over, walk.helpers);
    const code = over.kind === 'code' ? over.code : jsonLiteral(over.value);
    // Every copy is keyed by its position, which is the key the runtime uses too: there is
    // one node here drawn several times, and nothing in the document identifies an item.
    if (element_) element_.attrs.unshift({ name: 'key', kind: 'expr', code: 'index' });

    out = {
      kind: 'map',
      over: listCode(code, walk.helpers),
      // `index` is named whether or not it is read: it is what keys the copies.
      params: '(item, index)',
      statements: inner,
      child: out,
    };
  }

  return out;
}

/** Whether a body reads a name — not as part of a longer one, and not after a dot. */
export function reads(body: string, name: string): boolean {
  return new RegExp(`(?<![.\\w$])${name}\\b`).test(body);
}

export { printJsx };
