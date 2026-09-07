/**
 * The document model — PLAN.md §3.
 *
 * Everything the product does is an editor over this one structure. The types are
 * written by hand (they are the contract other packages program against) and the
 * zod schemas mirror them for validation at the API boundary. Where the two could
 * drift, the type is the source of truth and the schema is deliberately permissive:
 * a document that fails to validate must never be a document the studio could have
 * produced.
 *
 * D3: `nodes` is a flat map, not a nested tree. Every operation in `ops.ts` is then
 * an O(1) lookup plus a splice, undo/redo is a shallow diff, and no operation has to
 * walk the whole document to find a node by id.
 */

import { z } from 'zod';

export type NodeId = string;

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export const JsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonSchema),
    z.record(z.string(), JsonSchema),
  ]),
);

/**
 * A prop is either a literal the inspector edited, or an expression evaluated
 * against the render scope.
 *
 * `code` is **template source**, not a bare JavaScript expression: it is exactly what
 * the user typed, `{{ }}` holes and all, so `Hello {{ state.name }}` round-trips back
 * into the field it was typed in without an inverse compiler. `expr.ts` owns reading
 * it; the rule that one hole and nothing else yields the raw value — rather than its
 * string form — lives there too, and is what lets a boolean prop be bound.
 */
export type PropValue = { kind: 'static'; value: Json } | { kind: 'expr'; code: string };

export const PropValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('static'), value: JsonSchema }),
  z.object({ kind: z.literal('expr'), code: z.string() }),
]);

/** camelCase CSS properties. Numbers get a unit applied by `style.ts`, not here. */
export type StyleDecls = Record<string, string | number>;

export const StyleDeclsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export type StyleState = 'default' | 'hover' | 'focus' | 'active' | 'disabled';

export const STYLE_STATES: readonly StyleState[] = [
  'default',
  'hover',
  'focus',
  'active',
  'disabled',
];

/**
 * breakpointId -> pseudo-state -> declarations.
 *
 * `base` is the mobile-first default and is the only breakpoint guaranteed to exist;
 * every other key must match a `Theme.breakpoints[].id`.
 */
export type StyleSet = Record<string, Partial<Record<StyleState, StyleDecls>>>;

export const StyleSetSchema = z.record(z.string(), z.record(z.string(), StyleDeclsSchema));

/**
 * One step of an event handler — PLAN.md §10.
 *
 * Two departures from the sketch there, both for the same reason. Every value a step
 * carries is a `PropValue` rather than a bare `Expr`, so `navigate to '/about'` is a
 * literal and `navigate to {{ state.next }}` is an expression, edited by the one
 * control that already edits props. And a step names its state variable and its query
 * by **id** (`stateId`, `queryId`) rather than by name, so renaming one does not
 * silently break every handler that used it. Expressions still reference state by name
 * — `state.count` is free-form text and nothing can rewrite it safely — which is why
 * the ids are used everywhere they can be.
 *
 * `openOverlay`/`closeOverlay` are deliberately absent: there are no overlay components
 * in the library yet, and a step kind the runtime cannot execute is one the editor would
 * happily let someone author. Adding a member later is not a migration, because no
 * stored document can contain one.
 */
export type ActionStep =
  | { kind: 'setState'; stateId: string; value: PropValue }
  | { kind: 'toggleState'; stateId: string }
  | { kind: 'runQuery'; queryId: string }
  | { kind: 'navigate'; to: PropValue }
  | { kind: 'showToast'; message: PropValue }
  | { kind: 'custom'; code: string };

export const ActionStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('setState'), stateId: z.string().min(1), value: PropValueSchema }),
  z.object({ kind: z.literal('toggleState'), stateId: z.string().min(1) }),
  z.object({ kind: z.literal('runQuery'), queryId: z.string().min(1) }),
  z.object({ kind: z.literal('navigate'), to: PropValueSchema }),
  z.object({ kind: z.literal('showToast'), message: PropValueSchema }),
  z.object({ kind: z.literal('custom'), code: z.string() }),
]);

export const ACTION_KINDS = [
  'setState',
  'toggleState',
  'runQuery',
  'navigate',
  'showToast',
  'custom',
] as const satisfies readonly ActionStep['kind'][];

/**
 * Renders a node once per item of a collection.
 *
 * An object with one field rather than a bare `PropValue` because the fields that will
 * join it — a key expression, custom item names — would each be a document migration if
 * the shape had to grow from a value into a record. The item and index are always named
 * `item` and `index` in scope; nested repeats shadow, exactly as the `.map()` codegen
 * emits does, so the canvas and the export agree without a rule being written down twice.
 */
export interface RepeatSpec {
  /** Evaluates to an array. Anything else renders nothing rather than throwing. */
  over: PropValue;
}

export const RepeatSpecSchema = z.object({ over: PropValueSchema });

export interface Node {
  id: NodeId;
  parentId: NodeId | null;
  /** Registry key — 'VStack' | 'Text' | 'Button'. Stable across renames. */
  type: string;
  /** The layer name shown in the outline. Defaults to the spec's displayName. */
  name: string;
  children: NodeId[];
  props: Record<string, PropValue>;
  styles: StyleSet;
  /** 'onClick' -> the steps that run, in order. */
  events: Record<string, ActionStep[]>;
  repeat?: RepeatSpec;
  /**
   * Conditional visibility: the node renders only when this evaluates truthy.
   *
   * Distinct from `hidden`, which is the author's own toggle in the layers tree — a
   * design-time state with no expression behind it. A node can be hidden while editing
   * and still carry a condition that decides its fate in the export.
   */
  showIf?: PropValue;
  hidden?: boolean;
  locked?: boolean;
}

export const NodeSchema: z.ZodType<Node> = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  type: z.string().min(1),
  name: z.string(),
  children: z.array(z.string().min(1)),
  props: z.record(z.string(), PropValueSchema),
  styles: StyleSetSchema,
  events: z.record(z.string(), z.array(ActionStepSchema)),
  repeat: RepeatSpecSchema.optional(),
  showIf: PropValueSchema.optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
}) as z.ZodType<Node>;

export interface Breakpoint {
  id: string;
  label: string;
  minWidth: number;
}

/**
 * Design tokens. Serialized to CSS custom properties by `style.ts`, which is why
 * `colors` holds real CSS colours rather than raw channel triples — a node style can
 * then say `var(--primary)` and the canvas, the preview and the export all agree
 * without a resolution step in between.
 */
export interface Theme {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  space: Record<string, string>;
  radii: Record<string, string>;
  breakpoints: Breakpoint[];
}

export const ThemeSchema: z.ZodType<Theme> = z.object({
  colors: z.record(z.string(), z.string()),
  fonts: z.record(z.string(), z.string()),
  space: z.record(z.string(), z.string()),
  radii: z.record(z.string(), z.string()),
  breakpoints: z.array(
    z.object({ id: z.string(), label: z.string(), minWidth: z.number().int().nonnegative() }),
  ),
});

/**
 * A page-scoped variable — PLAN.md §10. Read in an expression as `state.<name>`, which
 * is why the name has to be a JavaScript identifier and unique on the page: two
 * variables called `count` would be one key in the render scope, with the second
 * silently winning. `ops.ts` enforces both.
 *
 * `type` is what the editor offers a control for and what codegen writes into
 * `useState`; it is not enforced at runtime, because an action can put anything in a
 * variable and a document that refuses to render is worse than one that shows a number
 * where a string was promised.
 */
export interface StateVar {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  initial: Json;
}

export const STATE_VAR_TYPES = ['string', 'number', 'boolean', 'json'] as const;

export const StateVarSchema: z.ZodType<StateVar> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(STATE_VAR_TYPES),
  initial: JsonSchema,
});

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * An HTTP data source — PLAN.md §10. Read in an expression as `queries.<name>`, which
 * carries `{ loading, data, error }` rather than the payload alone: a list that has to
 * say "loading" cannot do it from the rows.
 *
 * `url`, `body` and every header value are template source, so `{{ state.userId }}`
 * interpolates into any of them.
 */
export interface QueryDef {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  runOnLoad: boolean;
}

export const QueryDefSchema: z.ZodType<QueryDef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  method: z.enum(HTTP_METHODS),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  runOnLoad: z.boolean(),
});

/**
 * A tree of nodes with a root — the unit every operation in `ops.ts` works on.
 *
 * It exists because there are now two things shaped like this: a `Page`, and a
 * `SymbolDef`. Making the operations generic over this is what keeps there being one
 * `moveNode` rather than two that agree until one of them is fixed. The tree ops are the
 * ones that fit; anything that touches `state`, `queries` or `props` still names its own
 * type, because those are what the two are genuinely different about.
 */
export interface NodeTree {
  rootId: NodeId;
  nodes: Record<NodeId, Node>;
}

export interface Page extends NodeTree {
  id: string;
  name: string;
  /** '/', '/about', '/users/:id' */
  path: string;
  state: StateVar[];
  queries: QueryDef[];
}

export const PageSchema: z.ZodType<Page> = z.object({
  id: z.string().min(1),
  name: z.string(),
  path: z.string(),
  rootId: z.string().min(1),
  nodes: z.record(z.string(), NodeSchema),
  state: z.array(StateVarSchema),
  queries: z.array(QueryDefSchema),
}) as z.ZodType<Page>;

/* -------------------------------------------------------------------------- */
/* Symbols — reusable user components, PLAN.md §12                             */
/* -------------------------------------------------------------------------- */

/**
 * The types a symbol's prop can declare.
 *
 * Deliberately the same set `PropSpec` offers in `@ui-builder/components`, minus the ones
 * a user cannot usefully author, because a symbol's props become a `ComponentSpec` and are
 * then edited by the *same* Props tab that edits a Button's. The union is restated here
 * rather than imported because the dependency runs the other way — `schema` may not know
 * that a component library exists (PLAN.md §2) — and `symbolSpec`'s own test asserts every
 * member maps to a `PropSpec` type, which is what would catch the two drifting apart.
 */
export const SYMBOL_PROP_TYPES = [
  'string',
  'text',
  'number',
  'boolean',
  'color',
  'url',
  'enum',
] as const;

export type SymbolPropType = (typeof SYMBOL_PROP_TYPES)[number];

export interface SymbolPropOption {
  label: string;
  value: string;
}

/**
 * One prop a symbol takes — the whole of its surface.
 *
 * Read inside the symbol as `props.<name>`, which is why `name` has to be an identifier
 * and unique within the symbol, exactly as a `StateVar`'s is within its page.
 *
 * An instance stores its values in `Node.props`, keyed by this **name** rather than by
 * `id` — the opposite of the choice `ActionStep` made, and for a reason that does not
 * apply here. A step's `stateId` protects free-form expression text that nothing can
 * safely rewrite; an instance's props are a structured record, so a rename can move the
 * key on every instance and does (`renameSymbolProp`). Keying by name is also what lets a
 * symbol become a `ComponentSpec` and be edited by the ordinary Props tab, instead of the
 * inspector, the renderer and the generator each learning a second way to read a prop.
 */
export interface SymbolProp {
  id: string;
  name: string;
  label: string;
  type: SymbolPropType;
  /** `enum` only. Ignored, but preserved, for every other type. */
  options?: SymbolPropOption[];
  defaultValue: Json;
}

export const SymbolPropSchema: z.ZodType<SymbolProp> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  label: z.string(),
  type: z.enum(SYMBOL_PROP_TYPES),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  defaultValue: JsonSchema,
});

/**
 * A reusable user component — a node tree with a prop surface, PLAN.md §12.
 *
 * Document-scoped rather than page-scoped: a component used on one page only is a
 * subtree, and the thing that makes symbols worth building is the card that appears on
 * four pages and is edited once.
 *
 * It has no `state` or `queries` of its own, and the omission is the design rather than a
 * gap: a component that reads the page it happens to sit on is not reusable, and the
 * generated component has neither name in scope. What flows in is `props`, which is what
 * the render scope has been holding a slot for since §10.
 */
export interface SymbolDef extends NodeTree {
  id: string;
  /** Becomes the palette entry and, through `componentName`, the exported component. */
  name: string;
  /** One line, shown in the palette on hover. */
  description: string;
  props: SymbolProp[];
}

export const SymbolDefSchema: z.ZodType<SymbolDef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  rootId: z.string().min(1),
  nodes: z.record(z.string(), NodeSchema),
  props: z.array(SymbolPropSchema),
}) as z.ZodType<SymbolDef>;

/**
 * How an instance names the symbol it renders — `Node.type` is `symbol:<id>`.
 *
 * A namespaced registry key rather than a second field on `Node`, because `type` is
 * already the question "what does this node render?" and every reader already asks it.
 * `getSpec` misses the whole namespace by construction, so the branch is one call to
 * `symbolIdOf` at each of the four places that need it, rather than an optional field
 * that every other reader has to remember to check.
 *
 * By id and not by name, for `ActionStep`'s reason: renaming a symbol must not turn every
 * instance of it into an unknown component.
 */
export const SYMBOL_TYPE_PREFIX = 'symbol:';

export function symbolType(symbolId: string): string {
  return `${SYMBOL_TYPE_PREFIX}${symbolId}`;
}

/** The symbol a node type names, or null when it names a library component. */
export function symbolIdOf(type: string): string | null {
  return type.startsWith(SYMBOL_TYPE_PREFIX) ? type.slice(SYMBOL_TYPE_PREFIX.length) : null;
}

/** Bumped whenever a change to these types needs a migration on load. */
export const DOC_SCHEMA_VERSION = 3;

export interface ProjectDoc {
  schemaVersion: number;
  id: string;
  name: string;
  pages: Page[];
  symbols: SymbolDef[];
  theme: Theme;
}

export const ProjectDocSchema: z.ZodType<ProjectDoc> = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string(),
  pages: z.array(PageSchema).min(1),
  symbols: z.array(SymbolDefSchema),
  theme: ThemeSchema,
}) as z.ZodType<ProjectDoc>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * This package compiles against bare ES2023 — no DOM lib, no Node types — because it
 * is the one thing the API, the studio and the code generator all import, and none of
 * them should be able to leak their environment into the contract. `crypto` is
 * present in every runtime that matters, but it is not in that lib, so it is reached
 * for narrowly and with a fallback rather than by widening the whole package's types.
 */
interface RandomSource {
  getRandomValues(array: Uint8Array): Uint8Array;
}

const randomSource: RandomSource | undefined = (globalThis as { crypto?: RandomSource }).crypto;

/**
 * Short, URL- and class-name-safe ids.
 *
 * Not a UUID: node ids end up in generated class names (`.ub-n-<id>`) and in every
 * diff the history stores, so 10 characters of entropy that read cleanly in a
 * stylesheet beat 36 characters that do not. ~51 bits is ample for one document.
 */
export function createNodeId(): NodeId {
  const bytes = new Uint8Array(10);
  if (randomSource?.getRandomValues) {
    randomSource.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  let id = '';
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

/**
 * A deep copy of the JSON-shaped parts of a node.
 *
 * `structuredClone` would do this, and is available everywhere this runs, but it is
 * not in the ES2023 lib either — and a document's styles and events are JSON by
 * definition, so the narrower operation is also the more honest one.
 */
export function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => cloneJson(item)) as T;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = cloneJson(item);
  }
  return out as T;
}

/** A node with every required field filled in, so callers only pass what differs. */
export function makeNode(init: Partial<Node> & Pick<Node, 'type' | 'name'>): Node {
  return {
    id: init.id ?? createNodeId(),
    parentId: init.parentId ?? null,
    type: init.type,
    name: init.name,
    children: init.children ?? [],
    props: init.props ?? {},
    styles: init.styles ?? {},
    events: init.events ?? {},
    ...(init.repeat === undefined ? {} : { repeat: init.repeat }),
    ...(init.showIf === undefined ? {} : { showIf: init.showIf }),
    ...(init.hidden === undefined ? {} : { hidden: init.hidden }),
    ...(init.locked === undefined ? {} : { locked: init.locked }),
  };
}

/**
 * A page with every required field filled in — the `makeNode` of pages.
 *
 * It exists because `state` and `queries` were added to `Page` in schema 2 and every
 * literal that built one had to grow two empty arrays. The next field to arrive should
 * be one edit here rather than another sweep. It deliberately does not create a root
 * node: a page's root is made of a real component, and this package is not allowed to
 * know that any exist (see `createPage` in `@ui-builder/components`).
 */
export function makePage(init: Partial<Page> & Pick<Page, 'id' | 'rootId' | 'nodes'>): Page {
  return {
    id: init.id,
    name: init.name ?? 'Page',
    path: init.path ?? '/',
    rootId: init.rootId,
    nodes: init.nodes,
    state: init.state ?? [],
    queries: init.queries ?? [],
  };
}

/**
 * A symbol with every required field filled in — `makePage` for the other tree.
 *
 * Like it, this does not create a root node: a symbol's root is made of a real component,
 * and this package is not allowed to know that any exist (see `createSymbol` in
 * `@ui-builder/components`).
 */
export function makeSymbol(
  init: Partial<SymbolDef> & Pick<SymbolDef, 'id' | 'rootId' | 'nodes'>,
): SymbolDef {
  return {
    id: init.id,
    name: init.name ?? 'Component',
    description: init.description ?? '',
    rootId: init.rootId,
    nodes: init.nodes,
    props: init.props ?? [],
  };
}

/** Convenience for the common case — the inspector writes literals, not expressions. */
export function staticProp(value: Json): PropValue {
  return { kind: 'static', value };
}

/**
 * Reads a prop as a plain literal, ignoring expressions.
 *
 * Anything that renders wants `evaluateProp` (`expr.ts`) instead, which needs a scope.
 * This stays for the callers that genuinely have none — the palette's previews, the
 * layers tree's derived names, and codegen deciding whether a value is knowable at
 * generation time.
 */
export function readProp(node: Node, name: string): Json | undefined {
  const prop = node.props[name];
  if (!prop) return undefined;
  return prop.kind === 'static' ? prop.value : undefined;
}
