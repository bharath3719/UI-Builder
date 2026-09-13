/**
 * Symbols, seen as components — PLAN.md §12 meeting D7.
 *
 * A symbol is a document's own reusable component, and the point of this module is that
 * nothing downstream has to know that. `symbolSpec` turns one into an ordinary
 * {@link ComponentSpec}, so the palette lists it, search finds it, the Props tab
 * generates its fields, `createNodeFor` builds an instance with its defaults baked in and
 * the drag rules consult `acceptsChildren` — all through the code paths that already
 * existed. The four places that genuinely have to know are the ones that render or emit
 * the symbol's *contents*, and each of those branches on `symbolIdOf`.
 *
 * This file is data, like everything `@ui-builder/components` exports from `.` — see
 * `spec.ts`. The icon is a name; `react/implementations.ts` holds the icon itself.
 */

import {
  copySubtree,
  createNodeId,
  getNode,
  makeNode,
  makeSymbol,
  symbolIdOf,
  symbolType,
  toComponentName,
  uniqueSymbolName,
  type Node,
  type NodeId,
  type NodeTree,
  type ProjectDoc,
  type SymbolDef,
  type SymbolProp,
} from '@ui-builder/schema';
import type { ComponentSpec, PropSpec } from './spec.js';
import { SLOT_TYPE } from './specs/Slot.js';

/**
 * The lucide name every symbol's palette entry and layer row uses.
 *
 * One icon for all of them, deliberately: a project's components are told apart by their
 * names, and a per-symbol icon picker is the `Icon` prop type's problem (§7) rather than
 * something to solve twice.
 */
export const SYMBOL_ICON = 'Component';

/**
 * One declared prop as the inspector's field.
 *
 * The two type unions are the same set by construction — `SYMBOL_PROP_TYPES` was written
 * from `PropSpec`'s — and `symbols.test.ts` asserts it, because the failure otherwise is a
 * field the Props tab silently cannot render.
 */
function toPropSpec(prop: SymbolProp): PropSpec {
  if (prop.type === 'enum') {
    return { name: prop.name, label: prop.label, type: 'enum', options: prop.options ?? [] };
  }
  return { name: prop.name, label: prop.label, type: prop.type };
}

/**
 * The slot in a symbol, or null — the node an instance's children are rendered at.
 *
 * Derived from the tree rather than recorded on the `SymbolDef`, which is
 * `symbolDependencies`' argument and the reason slots needed no migration: a derived
 * answer cannot go stale, and a stored `acceptsChildren` flag would be one more thing that
 * has to be kept true every time a node is deleted.
 *
 * One slot, deliberately (PLAN.md §12). Named slots are the additive next step — a `slot`
 * field on the child node routes it, and nothing here has to move for that — but "which
 * slot does this child go in" is a question the layers tree and the inspector both have to
 * answer, and a header/body/footer surface is worth building once rather than twice.
 * `first` rather than a uniqueness check because a document can outlive the rule that
 * produced it: the palette stops a second one being authored, and this decides what a
 * document that arrived with two means anyway.
 */
export function symbolSlotId(symbol: SymbolDef): string | null {
  for (const node of Object.values(symbol.nodes)) {
    if (node.type === SLOT_TYPE) return node.id;
  }
  return null;
}

/** Whether a placement of this symbol may be given children of its own. */
export function symbolAcceptsChildren(symbol: SymbolDef): boolean {
  return symbolSlotId(symbol) !== null;
}

/**
 * A symbol as a component spec.
 *
 * Derived on demand rather than cached beside the document: a spec is a few objects, and
 * a cache keyed by a symbol that is being edited every keystroke is a cache that is wrong
 * more often than it is right. Callers that need it per render memoise on `doc.symbols`,
 * which is a reference that changes exactly when a symbol does.
 */
export function symbolSpec(symbol: SymbolDef): ComponentSpec {
  return {
    key: symbolType(symbol.id),
    displayName: symbol.name,
    category: 'Symbols',
    icon: SYMBOL_ICON,
    keywords: ['component', 'symbol', ...symbol.name.toLowerCase().split(/\s+/).filter(Boolean)],
    description:
      symbol.description || 'A reusable component in this project. Edit it once, everywhere.',

    props: symbol.props.map(toPropSpec),
    // No events: an instance is configured by its props, and giving it handlers of its own
    // would mean deciding which node inside receives them. Children are a different
    // question and now have an answer — the symbol says where they go by containing a
    // `Slot`, so a component with no slot still refuses them and a drop onto it targets
    // its parent exactly as it did before.
    events: [],
    acceptsChildren: symbolAcceptsChildren(symbol),

    defaultProps: Object.fromEntries(symbol.props.map((prop) => [prop.name, prop.defaultValue])),
    // Empty on purpose: a symbol's own look lives on its root node, inside the symbol. An
    // instance's `styles` are the *overrides* the Design tab writes, and they land on the
    // same element because the generated component merges the class it is handed.
    defaultStyles: {},

    codegen: {
      // Nominal. The project generator de-duplicates symbol names across the document
      // exactly as it does page names, so the tag it actually writes comes from that map —
      // this is what the name would be if it were the only one.
      tag: toComponentName(symbol.name),
    },
  };
}

/** The derived spec for a node type in the `symbol:` namespace, or undefined. */
export function specForSymbolType(
  type: string,
  symbols: readonly SymbolDef[],
): ComponentSpec | undefined {
  const symbolId = symbolIdOf(type);
  if (symbolId === null) return undefined;

  const symbol = symbols.find((candidate) => candidate.id === symbolId);
  return symbol ? symbolSpec(symbol) : undefined;
}

/**
 * A blank symbol: one container root that accepts children, and no props yet.
 *
 * Built here rather than in `schema` for `createPage`'s reason — a root is made of a real
 * component, and `schema` is not allowed to know that any exist. Detached, so the caller
 * inserts it with `addSymbol`; see `copySymbol` for why ids are minted before the updater
 * rather than inside it.
 *
 * The root is a plain `Box` with `display: flex` and nothing else. A symbol has no
 * artboard of its own to fill, so the page root's `min-height: 100%` would be wrong here:
 * a component is as tall as what is in it.
 */
export function createSymbol(doc: ProjectDoc, init: { name?: string } = {}): SymbolDef {
  const root = makeNode({
    id: createNodeId(),
    type: 'Box',
    name: 'Root',
    styles: {
      base: {
        default: {
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        },
      },
    },
  });

  return makeSymbol({
    id: createNodeId(),
    name: uniqueSymbolName(doc, init.name ?? 'Component'),
    rootId: root.id,
    nodes: { [root.id]: root },
  });
}

/**
 * A component made out of something already on the canvas — PLAN.md §12.
 *
 * The gesture that matters, and the one `createSymbol` does not cover: a card someone has
 * already built and now wants four of. It is `copySymbol` in reverse — a subtree lifted out
 * of a tree and given a name — plus the instance that goes back where it came from.
 *
 * **The styles go with the component, not with the placement.** That is §12's open
 * question, and this is the answer: the author selected a thing that looks like *that*, so
 * a component that arrived unstyled and left the look behind on the page would not be the
 * thing they selected. Nothing is lost by it — an instance's own rules are written second
 * and both weigh one class, so a later per-placement override still wins (D6, and the same
 * source order codegen emits).
 *
 * **One node, not a selection of several.** Several siblings would need a root to live in,
 * and inventing a `Box` to be that root silently changes the layout: three rows that were
 * flex children of the page become one flex child containing three. Refusing is the honest
 * answer, and the studio says so rather than offering the command — wrap them yourself and
 * the wrapper is a decision you made and can see.
 *
 * Returns both halves detached, for `copySymbol`'s reason: ids must be minted outside a
 * React state updater, which can run twice and would otherwise leave the caller holding an
 * id the committed document does not contain.
 */
export function symbolFromSelection(
  doc: ProjectDoc,
  tree: NodeTree,
  nodeId: NodeId,
  init: { name?: string } = {},
  newId: () => NodeId = createNodeId,
): { symbol: SymbolDef; instance: Node } {
  const source = getNode(tree, nodeId);
  if (source.parentId === null) {
    // The root *is* the surface. Turning it into a component would leave the page with an
    // instance as its root and no container of its own, and the next thing anyone dropped
    // on that page would have nowhere to go.
    throw new Error('a page or component root cannot itself become a component');
  }

  const { nodes, rootId } = copySubtree(tree, nodeId, newId);

  const symbol = makeSymbol({
    id: newId(),
    name: uniqueSymbolName(doc, init.name ?? source.name),
    rootId,
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    // No props. What would be a prop here is a judgement about which of the strings inside
    // are meant to vary, and guessing wrong writes a surface the author then has to undo.
    // The Props panel is where that is decided, on a component that already exists.
    props: [],
  });

  return {
    symbol,
    // Through `createNodeFor` and `symbolSpec` rather than hand-built, so an instance made
    // this way is indistinguishable from one dragged out of the palette — same defaults,
    // same name, one code path (D7).
    instance: createNodeForSymbol(symbol),
  };
}

/**
 * A fresh instance of a symbol.
 *
 * Split out only to break the import cycle `registry.ts` would otherwise have with this
 * file: `createNodeFor` lives there and reads `symbolSpec` from here.
 */
function createNodeForSymbol(symbol: SymbolDef): Node {
  const spec = symbolSpec(symbol);
  return makeNode({ id: createNodeId(), type: spec.key, name: symbol.name });
}
