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
  createNodeId,
  makeNode,
  makeSymbol,
  symbolIdOf,
  symbolType,
  toComponentName,
  uniqueSymbolName,
  type ProjectDoc,
  type SymbolDef,
  type SymbolProp,
} from '@ui-builder/schema';
import type { ComponentSpec, PropSpec } from './spec.js';

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
    // No events and no children in this pass. An instance is configured by its props; the
    // handlers and the slots belong to whatever is inside the symbol, and giving an
    // instance its own would mean deciding which node inside receives them.
    events: [],
    acceptsChildren: false,

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
