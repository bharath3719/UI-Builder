/**
 * The runtime renderer — PLAN.md §5 and §10.
 *
 * The same component renders the canvas, the preview and (via codegen's equivalent
 * output) the exported app. `editing` is the only difference between them, and it
 * adds editor affordances rather than changing how anything is laid out — so what a
 * user sees on the canvas is what they ship.
 *
 * Interactions are the one place that rule needs a footnote, and it is a short one.
 * Bindings, `repeat` and `showIf` are evaluated identically in both, because they decide
 * what is on the screen. Event handlers are attached only when not editing: on the canvas
 * a click selects a node, and running the author's `onClick` would fight the editor for
 * the same gesture. The preview is where a design becomes operable, which is most of what
 * makes it worth opening.
 */

import {
  COMPONENT_CSS,
  EMPTY_CONTAINER_CSS,
  coerceToProp,
  isDesignTimeControl,
  specFor,
  type ComponentSpec,
} from '@ui-builder/components';
import { componentFor } from '@ui-builder/components/react';
import {
  evaluateProp,
  isTruthy,
  type EvaluateExpression,
  nodeClassName,
  serializePageStyles,
  serializeStatePreview,
  serializeTheme,
  symbolIdOf,
  type Json,
  type Node,
  type NodeTree,
  type Page,
  type RenderScope,
  type StyleState,
  type SymbolDef,
  type Theme,
} from '@ui-builder/schema';
import {
  NODE_ERROR_ATTRIBUTE,
  NODE_ID_ATTRIBUTE,
  NODE_INACTIVE_ATTRIBUTE,
  NODE_STATUS_CSS,
} from './attributes.js';
import { createEvaluator, type EvalRealm, type ExpressionError } from './evaluate.js';
import { NodeErrorBoundary } from './NodeErrorBoundary.js';
import { usePageRuntime, type PageRuntimeValue } from './runtime.js';
import { Toasts } from './Toasts.js';

export { NODE_ID_ATTRIBUTE };

export interface RenderContext {
  /**
   * The tree being walked — the page, or a symbol's own nodes once the walk has descended
   * into an instance. `NodeRenderer` resolves every id against this and nothing else,
   * which is what lets one renderer draw both without knowing which it started from.
   */
  tree: NodeTree;
  /** The document's reusable components, so an instance can find what it renders. */
  symbols: readonly SymbolDef[];
  /**
   * Editor affordances: `data-ub-*` attributes for hit-testing, a drop placeholder in
   * empty containers, form controls made inert so a design-time click selects the node
   * instead of operating the control, and no event handlers at all.
   */
  editing: boolean;
  emptyLabel: string;
  /**
   * True below a symbol instance's root.
   *
   * What is inside an instance belongs to the symbol, not to the page: it cannot be
   * selected, dropped into or renamed from here, so it is given no editor attributes at
   * all and a click on it hit-tests up to the instance. The instance's *own* element is
   * the exception, and gets its attributes through `overlay` instead.
   */
  insideInstance: boolean;
  /**
   * The symbols this walk is already inside, so a component that contains itself draws a
   * box rather than recursing forever. `canPlaceSymbol` refuses to author one; this is the
   * backstop for a document that arrived with one anyway.
   */
  rendering: readonly string[];
  /** Where expressions compile — the canvas frame's window. See `evaluate.ts`. */
  realm: EvalRealm | null;
  runtime: PageRuntimeValue;
}

/**
 * What an instance imposes on the element its symbol's root renders as.
 *
 * There is no wrapper element: an instance is the root of what it renders, wearing one
 * extra class. A wrapper would be a box in the middle of someone's flex row that exists
 * only because the builder needed somewhere to hang an id — and it would have to exist in
 * the export too, or the canvas and the export would lay out differently (D6). The
 * generated component takes the same class as a `className` prop for exactly this reason.
 */
interface InstanceOverlay {
  /** The instance node's own class, so the Design tab can style one placement. */
  className: string;
  /** `data-ub-node-id` and friends for the instance, replacing the root node's. */
  attrs: Record<string, unknown>;
}

/** Props the document stores, evaluated to the plain values the component can take. */
function resolveProps(
  node: Node,
  spec: ComponentSpec,
  evaluate: EvaluateExpression,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [name, prop] of Object.entries(node.props)) {
    // `className` and `children` are the renderer's to set. A document that somehow
    // carries either must not be able to detach a node from its own subtree or drop
    // the class its styles are written against.
    if (name === 'className' || name === 'children' || name === 'key') continue;

    const value = evaluateProp(prop, evaluate);
    const declared = spec.props.find((candidate) => candidate.name === name);

    // Only a binding is coerced, and only toward what the spec declares — see
    // `coerceToProp`, which is shared with codegen so that the two cannot drift.
    resolved[name] = prop.kind === 'expr' && declared ? coerceToProp(value, declared) : value;
  }

  return resolved;
}

/**
 * What a `repeat` iterates.
 *
 * An array is the answer nearly every time — a query's rows. A number is the other one
 * worth having, because "three of these" is a layout, not a data source, and binding it
 * to `{{ 3 }}` should not require inventing a list. Anything else repeats nothing: a
 * `repeat` bound to a query that has not answered yet is not an error, it is a list that
 * is still empty.
 */
function repeatItems(value: unknown): Json[] {
  if (Array.isArray(value)) return value as Json[];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Array.from({ length: Math.floor(value) }, (_, index) => index);
  }
  return [];
}

/**
 * The handlers a node's events become.
 *
 * Only events the *spec* declares are attached, so a document cannot make the renderer
 * pass an arbitrary prop to a component by naming it in `events` (D7: the registry is the
 * list, not the document).
 */
function eventHandlers(
  node: Node,
  spec: ComponentSpec,
  context: RenderContext,
  scope: RenderScope,
): Record<string, (event: unknown) => void> {
  if (context.editing) return {};

  const handlers: Record<string, (event: unknown) => void> = {};
  for (const name of spec.events) {
    const steps = node.events[name];
    if (!steps || steps.length === 0) continue;
    handlers[name] = (event: unknown) => context.runtime.dispatch(node, name, steps, event, scope);
  }

  return handlers;
}

function UnknownNode({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div
      className={className}
      style={{
        padding: '8px 12px',
        border: '1px dashed hsl(0 72% 51%)',
        borderRadius: 4,
        color: 'hsl(0 72% 51%)',
        font: '12px ui-monospace, monospace',
      }}
    >
      {children}
    </div>
  );
}

/**
 * The values an instance passes into its symbol.
 *
 * Evaluated against the scope the *instance* sits in, which is what makes
 * `<Card title={{ item.name }} />` inside a `repeat` mean the row it was drawn for. What
 * comes out is the whole of `props` inside the symbol — a component sees what it was
 * given and nothing about where it was given it.
 *
 * A prop the instance has no value for falls back to the symbol's default, which is how a
 * prop added after an instance was placed arrives with something sensible rather than
 * `undefined`. Codegen writes the same fallback as a default parameter value.
 */
function resolveSymbolProps(
  node: Node,
  symbol: SymbolDef,
  spec: ComponentSpec,
  evaluate: EvaluateExpression,
): Record<string, Json> {
  const out: Record<string, Json> = {};

  for (const prop of symbol.props) {
    const stored = node.props[prop.name];
    const declared = spec.props.find((candidate) => candidate.name === prop.name);

    let value = evaluateProp(stored, evaluate);
    // Only a binding is coerced, and only toward what the prop declares — the same rule
    // `resolveProps` follows, through the same function codegen uses (D6).
    if (stored?.kind === 'expr' && declared) value = coerceToProp(value, declared);

    out[prop.name] = (value === undefined ? prop.defaultValue : value) as Json;
  }

  return out;
}

/**
 * A symbol instance: the symbol's own tree, rendered under a scope of its props.
 *
 * The instance node contributes three things and no element of its own — the props, its
 * class, and the editor attributes that make it the selectable thing on this page. Its
 * children are not consulted: an instance has none, because what is inside it belongs to
 * the symbol (`acceptsChildren` is false on every derived spec).
 */
function SymbolInstance({
  node,
  symbol,
  spec,
  context,
  scope,
  evaluate,
  attrs,
}: {
  node: Node;
  symbol: SymbolDef;
  spec: ComponentSpec;
  context: RenderContext;
  scope: RenderScope;
  evaluate: EvaluateExpression;
  attrs: Record<string, unknown>;
}) {
  const inner: RenderContext = {
    ...context,
    tree: symbol,
    insideInstance: true,
    rendering: [...context.rendering, symbol.id],
  };

  // A component sees its props and the theme. Not `state` and not `queries`: those belong
  // to the page it happens to have been dropped on, and a component that reads them is one
  // that works on that page only. The generated component has neither name in scope
  // either, so an expression reaching for one fails the same way in both (D6).
  const innerScope: RenderScope = {
    state: {},
    queries: {},
    props: resolveSymbolProps(node, symbol, spec, evaluate),
    theme: scope.theme,
  };

  return (
    <NodeRenderer
      id={symbol.rootId}
      context={inner}
      scope={innerScope}
      overlay={{ className: nodeClassName(node.id), attrs }}
    />
  );
}

interface InstanceProps {
  node: Node;
  context: RenderContext;
  scope: RenderScope;
  /** Why this copy is on the canvas despite the data saying otherwise. Editor-only. */
  inactive?: string;
  /** Set on the root of a symbol instance's contents. See {@link InstanceOverlay}. */
  overlay?: InstanceOverlay;
}

/** One node, once — one iteration of a `repeat`, or the whole of a node without one. */
function NodeInstance({ node, context, scope, inactive, overlay }: InstanceProps) {
  // Collected during this render and read at the end of it. Local to the instance, so
  // nothing is written to state and no two nodes can report each other's failures.
  const problems: ExpressionError[] = [];
  const evaluate = createEvaluator(scope, {
    realm: context.realm,
    report: (problem) => problems.push(problem),
  });

  let dormant = inactive;
  if (node.showIf && !isTruthy(evaluateProp(node.showIf, evaluate))) {
    // The canvas keeps it, dimmed. Unlike `hidden`, which is an author's toggle with a
    // switch in the layers tree to undo it, a false condition is the *data* talking —
    // and a node that vanishes from the canvas because a variable is at its initial
    // value is a node nobody can select in order to change the condition.
    if (!context.editing) return null;
    dormant ??= 'Hidden by a condition';
  }

  const className = nodeClassName(node.id);
  const spec = specFor(node.type, context.symbols);

  const failure = problems[0];
  const status: Record<string, unknown> = {};
  if (context.editing) {
    if (failure) {
      const message = `{{ ${failure.source} }} — ${failure.message}`;
      status[NODE_ERROR_ATTRIBUTE] = message;
      status['title'] = message;
    }
    if (dormant) status[NODE_INACTIVE_ATTRIBUTE] = dormant;
  }

  // The instance's own attributes displace the symbol root's, so hit-testing anywhere in
  // the contents lands on the instance — which is the only node on this page that exists.
  const editorAttributes: Record<string, unknown> =
    context.editing && !(context.insideInstance && !overlay)
      ? {
          [NODE_ID_ATTRIBUTE]: node.id,
          'data-ub-type': node.type,
          ...(spec?.acceptsChildren && node.children.length === 0
            ? { 'data-ub-empty': context.emptyLabel }
            : {}),
          // Form controls would otherwise swallow the click that selects them, and an
          // input on the canvas is a picture of an input, not a working one. The preview
          // deliberately does not set this, which is what makes the same control real
          // there — see `valueBinding`.
          ...(spec && isDesignTimeControl(spec) ? { readOnly: true } : {}),
          ...overlay?.attrs,
        }
      : {};

  const symbolId = symbolIdOf(node.type);
  if (symbolId !== null) {
    const symbol = context.symbols.find((candidate) => candidate.id === symbolId);

    // A component that contains itself. `canPlaceSymbol` refuses to author one, so this is
    // a document that arrived with one — and drawing a box beats a stack overflow, which
    // takes the whole studio with it rather than the one node.
    if (symbol && context.rendering.includes(symbol.id)) {
      return (
        <UnknownNode className={className}>&ldquo;{symbol.name}&rdquo; contains itself</UnknownNode>
      );
    }

    if (!symbol || !spec) {
      return <UnknownNode className={className}>Unknown component</UnknownNode>;
    }

    return (
      <NodeErrorBoundary
        nodeId={node.id}
        nodeName={node.name}
        className={className}
        editing={context.editing}
        resetKey={node}
      >
        <SymbolInstance
          node={node}
          symbol={symbol}
          spec={spec}
          context={context}
          scope={scope}
          evaluate={evaluate}
          attrs={{ ...editorAttributes, ...status }}
        />
      </NodeErrorBoundary>
    );
  }

  const Component = spec ? componentFor(spec.key) : undefined;

  // A stored document can outlive the library that produced it. Rendering nothing
  // would silently delete the user's work from view; this keeps the node visible,
  // selectable and deletable. A spec with no implementation cannot happen — a test in
  // `components` fails the build on it — but it is the same failure to the user, so it
  // gets the same box rather than a crash.
  if (!spec || !Component) {
    return (
      <UnknownNode className={className}>Unknown component &ldquo;{node.type}&rdquo;</UnknownNode>
    );
  }

  const props = resolveProps(node, spec, evaluate);
  const handlers = eventHandlers(node, spec, context, scope);

  const children = spec.acceptsChildren
    ? node.children.map((childId) => (
        <NodeRenderer key={childId} id={childId} context={context} scope={scope} />
      ))
    : undefined;

  // An instance's class rides on the element its symbol's root renders as. Second, so it
  // wins on source order over the root's own rule — both weigh one class, and an override
  // written on a placement has to beat the component's own (D6: the same order codegen
  // writes, where the page module is imported after the component's).
  const classes = overlay ? `${className} ${overlay.className}` : className;

  return (
    <NodeErrorBoundary
      nodeId={node.id}
      nodeName={node.name}
      className={classes}
      editing={context.editing}
      resetKey={node}
    >
      {/* Handlers after props so a bound prop cannot displace one; editor attributes
          last, because `readOnly` has to win over anything the document says. */}
      <Component {...props} {...handlers} {...editorAttributes} {...status} className={classes}>
        {children}
      </Component>
    </NodeErrorBoundary>
  );
}

function NodeRenderer({
  id,
  context,
  scope,
  overlay,
}: {
  id: string;
  context: RenderContext;
  scope: RenderScope;
  overlay?: InstanceOverlay;
}) {
  const node = context.tree.nodes[id];
  if (!node || node.hidden) return null;
  if (!node.repeat) {
    return <NodeInstance node={node} context={context} scope={scope} overlay={overlay} />;
  }

  const evaluate = createEvaluator(scope, { realm: context.realm });
  const items = repeatItems(evaluateProp(node.repeat.over, evaluate));

  // Same reasoning as a false `showIf`: the editor keeps one copy so the node stays
  // selectable, and the preview and the export render what the data actually says.
  if (items.length === 0) {
    if (!context.editing) return null;
    return (
      <NodeInstance
        node={node}
        context={context}
        scope={scope}
        inactive="Repeats over nothing"
        overlay={overlay}
      />
    );
  }

  return (
    <>
      {items.map((item, index) => (
        // Every copy carries the same node id, so clicking any of them selects the node
        // they all come from — there is one node here, drawn several times, and the
        // inspector edits the one.
        <NodeInstance
          key={`${node.id}:${index}`}
          node={node}
          context={context}
          scope={{ ...scope, item, index }}
          overlay={overlay}
        />
      ))}
    </>
  );
}

/**
 * What the inspector is editing — editor-only, and the reason the canvas can differ
 * from the preview at the same width (PLAN.md §9).
 *
 * `breakpoint` caps the stylesheet so the canvas never shows a wider override than
 * the panel is displaying, and `state` forces the selected node's pseudo-state on so
 * hover styles are visible on a surface that swallows real hovers.
 */
export interface EditingCell {
  breakpoint: string;
  state: StyleState;
  /** The node whose state is forced. Only one — the selection. */
  nodeId?: string | null;
}

export interface PageRendererProps {
  page: Page;
  /**
   * The document's reusable components. Omitted by a host with none — a page that holds
   * no instance never reaches for one, and a test fixture should not have to say so.
   */
  symbols?: readonly SymbolDef[];
  theme: Theme;
  /**
   * Seeds `props` in the render scope. The studio passes a symbol's defaults while that
   * symbol is the surface being edited; a page passes nothing. See `PageRuntimeOptions`.
   */
  props?: Record<string, Json>;
  editing?: boolean;
  /** What an empty container invites you to do. Editor-only. */
  emptyLabel?: string;
  /** Editor-only. Omitted by the preview and the export, which show the real page. */
  cell?: EditingCell;
  /**
   * The window expressions compile in — `frame.contentDocument.defaultView`.
   *
   * Optional because a page can render before its frame's document exists, and because
   * a test has no frame; then the ambient realm is used. Passing it is what keeps user
   * code out of the studio's globals (`evaluate.ts`), so hosts that have a frame should.
   */
  realm?: EvalRealm | null;
  /** Where a `navigate` action goes. See `navigateTo` in `runtime.ts`. */
  onNavigate?: (to: string) => void;
}

/**
 * Renders a page, stylesheet included.
 *
 * The `<style>` is part of the render rather than something the host injects, because
 * the canvas mounts this through a portal into an iframe: emitting the CSS as an
 * element means it lands in the same document as the markup it styles, with no
 * separate synchronisation step to get out of order.
 *
 * Sheet order is load-bearing — theme tokens, then the library's base rules, then
 * per-node rules last, so a declaration the inspector wrote always beats the
 * component's own without needing extra specificity.
 */
function PageContents({
  page,
  symbols = [],
  theme,
  props,
  editing = false,
  emptyLabel,
  cell,
  realm,
  onNavigate,
}: PageRendererProps) {
  const runtime = usePageRuntime({ page, theme, props, realm, onNavigate });
  const previewed = cell?.nodeId ? page.nodes[cell.nodeId] : undefined;

  // The symbols' own rules first, then the page's — so an instance's override, which is a
  // node on the page, beats the symbol root's rule it shares an element with. Both weigh
  // one class, so source order is the whole of it, and it is the order codegen writes
  // (the page module is imported after the component's).
  //
  // Keyed by id so that editing a symbol — where the surface *is* one of these trees —
  // does not emit its rules twice.
  const styleNodes = new Map<string, Node>();
  for (const symbol of symbols) {
    for (const node of Object.values(symbol.nodes)) styleNodes.set(node.id, node);
  }
  for (const node of Object.values(page.nodes)) styleNodes.set(node.id, node);

  const css = [
    serializeTheme(theme),
    COMPONENT_CSS,
    editing ? EMPTY_CONTAINER_CSS : '',
    editing ? NODE_STATUS_CSS : '',
    serializePageStyles(styleNodes.values(), theme, { upTo: cell?.breakpoint }),
    // Last, so the forced state outranks the node's own rules on source order as well
    // as on specificity.
    previewed && cell ? serializeStatePreview(previewed, theme, cell) : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const context: RenderContext = {
    tree: page,
    symbols,
    editing,
    emptyLabel: emptyLabel ?? 'Drop a component here',
    insideInstance: false,
    rendering: [],
    realm: realm ?? null,
    runtime,
  };

  return (
    <>
      <style>{css}</style>
      <NodeRenderer id={page.rootId} context={context} scope={runtime.scope} />
      {editing ? null : <Toasts toasts={runtime.toasts} />}
    </>
  );
}

export function PageRenderer(props: PageRendererProps) {
  // Switching pages is a new page's state, not this one's applied to different nodes:
  // the key throws away the state variables, the query results and anything in flight,
  // rather than carrying one page's counter into the next.
  return <PageContents key={props.page.id} {...props} />;
}
