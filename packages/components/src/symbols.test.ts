import {
  SYMBOL_PROP_TYPES,
  addSymbol,
  makeNode,
  makeSymbol,
  symbolType,
  type ProjectDoc,
  type SymbolDef,
} from '@ui-builder/schema';
import { describe, expect, it } from 'vitest';
import { SLOT_TYPE } from './specs/Slot.js';
import { createNodeFor, createProjectDoc, getSpec, searchSpecs, specFor } from './registry.js';
import { createSymbol, symbolAcceptsChildren, symbolSlotId, symbolSpec } from './symbols.js';

function emptyDoc(): ProjectDoc {
  return createProjectDoc({ id: 'p', name: 'Site' });
}

function card(props: SymbolDef['props'] = []): SymbolDef {
  const root = makeNode({ id: 'root', type: 'Box', name: 'Root' });
  return makeSymbol({ id: 'sym', name: 'Product card', rootId: root.id, nodes: { root }, props });
}

describe('symbolSpec', () => {
  it('turns a symbol into an ordinary spec, so nothing downstream learns a second shape', () => {
    const spec = symbolSpec(card());

    expect(spec.key).toBe(symbolType('sym'));
    expect(spec.displayName).toBe('Product card');
    expect(spec.category).toBe('Symbols');
    // A component with no slot still refuses children: there would be nowhere to put
    // them, so a drop onto one targets its parent exactly as it did before slots existed.
    expect(spec.acceptsChildren).toBe(false);
    expect(spec.events).toEqual([]);
    expect(spec.codegen.tag).toBe('ProductCard');
  });

  it('offers every declared prop type as a field the inspector can render', () => {
    // The real risk this guards: `SYMBOL_PROP_TYPES` and `PropSpec`'s union are the same
    // set written twice — `schema` may not import this package (PLAN.md §2) — and a
    // member that fell out of step would be a prop with no control at all.
    const props = SYMBOL_PROP_TYPES.map((type, index) => ({
      id: `p${index}`,
      name: `prop${index}`,
      label: type,
      type,
      ...(type === 'enum' ? { options: [{ label: 'Quiet', value: 'quiet' }] } : {}),
      defaultValue: '',
    }));

    const spec = symbolSpec(card(props));

    expect(spec.props.map((prop) => prop.type)).toEqual([...SYMBOL_PROP_TYPES]);
    const declaredEnum = spec.props.find((prop) => prop.type === 'enum');
    expect(declaredEnum).toEqual({
      name: 'prop6',
      label: 'enum',
      type: 'enum',
      options: [{ label: 'Quiet', value: 'quiet' }],
    });
  });

  it('gives an enum with no options yet an empty list rather than undefined', () => {
    const spec = symbolSpec(
      card([{ id: 'p', name: 'tone', label: 'Tone', type: 'enum', defaultValue: '' }]),
    );

    expect(spec.props[0]).toEqual({ name: 'tone', label: 'Tone', type: 'enum', options: [] });
  });

  it('bakes the prop defaults into a fresh instance, as it does for a library component', () => {
    const spec = symbolSpec(
      card([{ id: 'p', name: 'title', label: 'Title', type: 'string', defaultValue: 'Untitled' }]),
    );

    const node = createNodeFor(spec);

    expect(node.type).toBe(symbolType('sym'));
    expect(node.name).toBe('Product card');
    expect(node.props).toEqual({ title: { kind: 'static', value: 'Untitled' } });
  });
});

describe('specFor', () => {
  it('answers for the library and for the document, and misses the same way for both', () => {
    const symbols = [card()];

    expect(specFor('Button', symbols)?.key).toBe('Button');
    expect(specFor(symbolType('sym'), symbols)?.displayName).toBe('Product card');
    // A symbol the document no longer has reads exactly like a component the library no
    // longer has, which is what lets the renderer's unknown box cover both.
    expect(specFor(symbolType('gone'), symbols)).toBeUndefined();
    expect(specFor('Carousel', symbols)).toBeUndefined();
  });

  it('is the whole of the branch — the registry alone never sees the namespace', () => {
    expect(getSpec(symbolType('sym'))).toBeUndefined();
  });
});

describe('search', () => {
  it('finds a symbol by its own name, and puts it above the library', () => {
    const results = searchSpecs('product', [card()]);

    expect(results[0]?.displayName).toBe('Product card');
  });

  it('lists the document’s own components first when nothing is typed', () => {
    expect(searchSpecs('', [card()])[0]?.category).toBe('Symbols');
  });
});

describe('createSymbol', () => {
  it('starts with a container root and no props', () => {
    const symbol = createSymbol(emptyDoc());

    expect(symbol.props).toEqual([]);
    const root = symbol.nodes[symbol.rootId];
    expect(root?.type).toBe('Box');
    // No `min-height: 100%`: a component is as tall as what is in it, unlike a page root
    // that has an artboard to fill.
    expect(root?.styles['base']?.default).not.toHaveProperty('minHeight');
  });

  it('takes a name that is free as of the document it is being added to', () => {
    const held = addSymbol(emptyDoc(), createSymbol(emptyDoc(), { name: 'Card' }));

    expect(createSymbol(held, { name: 'Card' }).name).toBe('Card 2');
  });
});

/** Slots — PLAN.md §12. */
describe('a symbol with a slot', () => {
  function withSlot(): SymbolDef {
    const root = makeNode({ id: 'root', type: 'Box', name: 'Root', children: ['slot'] });
    const slot = makeNode({ id: 'slot', type: SLOT_TYPE, name: 'Content', parentId: 'root' });
    return makeSymbol({ id: 'sym', name: 'Panel', rootId: root.id, nodes: { root, slot } });
  }

  it('accepts children, so a placement can be filled rather than only configured', () => {
    expect(symbolAcceptsChildren(withSlot())).toBe(true);
    expect(symbolSpec(withSlot()).acceptsChildren).toBe(true);
  });

  it('says so by containing one rather than by carrying a flag', () => {
    // Derived rather than stored, which is `symbolDependencies`' argument and the reason
    // slots needed no migration: deleting the slot node has to be enough, and a flag left
    // behind on the `SymbolDef` would be a component that still advertised a hole it no
    // longer has.
    expect(symbolSlotId(withSlot())).toBe('slot');
    expect(symbolSlotId(card())).toBeNull();
    expect(symbolAcceptsChildren(card())).toBe(false);
  });

  it('is offered only inside a component, and never on a page', () => {
    // The palette is what enforces this (see `placeable`), and the flag is what it reads.
    expect(getSpec(SLOT_TYPE)?.symbolOnly).toBe(true);
    expect(getSpec('Box')?.symbolOnly).toBeUndefined();
  });
});
