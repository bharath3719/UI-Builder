import { describe, expect, it } from 'vitest';
import {
  DOC_SCHEMA_VERSION,
  makeNode,
  makePage,
  makeSymbol,
  staticProp,
  symbolType,
  type Node,
  type ProjectDoc,
  type SymbolDef,
} from './doc.js';
import { exprProp, symbolPropUsage } from './expr.js';
import { insertNode, renameNode } from './ops.js';
import { DEFAULT_THEME } from './theme.js';
import {
  addSymbol,
  addSymbolProp,
  canPlaceSymbol,
  copySymbol,
  createSymbolProp,
  deleteSymbol,
  duplicateSymbol,
  getSymbol,
  moveSymbolProp,
  removeSymbolProp,
  renameSymbol,
  symbolDependencies,
  symbolInstances,
  symbolReaches,
  uniqueSymbolName,
  updateSymbol,
  updateSymbolProp,
} from './symbols.js';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function node(init: Partial<Node> & Pick<Node, 'id' | 'type'>): Node {
  return makeNode({ name: init.type, ...init });
}

/** A symbol whose root holds whatever nodes are given, in order. */
function symbol(id: string, name: string, children: Node[] = [], props: SymbolDef['props'] = []) {
  const root = node({ id: `${id}-root`, type: 'Box', children: children.map((n) => n.id) });
  return makeSymbol({
    id,
    name,
    rootId: root.id,
    props,
    nodes: Object.fromEntries(
      [root, ...children.map((child) => ({ ...child, parentId: root.id }))].map((n) => [n.id, n]),
    ),
  });
}

function page(id: string, path: string, children: Node[] = []) {
  const root = node({ id: `${id}-root`, type: 'Box', children: children.map((n) => n.id) });
  return makePage({
    id,
    name: id,
    path,
    rootId: root.id,
    nodes: Object.fromEntries(
      [root, ...children.map((child) => ({ ...child, parentId: root.id }))].map((n) => [n.id, n]),
    ),
  });
}

function doc(init: { pages?: ProjectDoc['pages']; symbols?: SymbolDef[] } = {}): ProjectDoc {
  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: 'project',
    name: 'Site',
    pages: init.pages ?? [page('home', '/')],
    symbols: init.symbols ?? [],
    theme: DEFAULT_THEME,
  };
}

/** An instance node of `symbolId`, with the prop values given. */
function instance(id: string, symbolId: string, props: Record<string, string> = {}): Node {
  return node({
    id,
    type: symbolType(symbolId),
    name: 'Card',
    props: Object.fromEntries(
      Object.entries(props).map(([key, value]) => [key, staticProp(value)]),
    ),
  });
}

/* -------------------------------------------------------------------------- */

describe('the symbol list', () => {
  it('adds a symbol and refuses one that is already there', () => {
    const card = symbol('sym-card', 'Card');
    const withCard = addSymbol(doc(), card);

    expect(withCard.symbols).toHaveLength(1);
    expect(getSymbol(withCard, 'sym-card').name).toBe('Card');
    expect(() => addSymbol(withCard, card)).toThrow(/already in this document/);
  });

  it('refuses a symbol that does not contain its own root', () => {
    const broken = makeSymbol({ id: 'sym', rootId: 'nowhere', nodes: {} });

    expect(() => addSymbol(doc(), broken)).toThrow(/own root node/);
  });

  it('suggests a free name rather than one already taken', () => {
    const held = doc({ symbols: [symbol('a', 'Card'), symbol('b', 'Card 2')] });

    expect(uniqueSymbolName(held, 'Card')).toBe('Card 3');
    expect(uniqueSymbolName(held, 'Banner')).toBe('Banner');
  });

  it('renames, and every instance keeps rendering because it names an id', () => {
    const held = addSymbol(
      doc({ pages: [page('home', '/', [instance('i1', 'sym-card')])] }),
      symbol('sym-card', 'Card'),
    );

    const renamed = renameSymbol(held, 'sym-card', 'Product card');

    expect(getSymbol(renamed, 'sym-card').name).toBe('Product card');
    expect(renamed.pages[0]!.nodes['i1']!.type).toBe(symbolType('sym-card'));
  });

  it('refuses an empty name', () => {
    const held = addSymbol(doc(), symbol('sym', 'Card'));

    expect(() => renameSymbol(held, 'sym', '   ')).toThrow(/needs a name/);
  });
});

describe('instances', () => {
  it('finds every instance, in pages and inside other symbols alike', () => {
    const held = doc({
      pages: [page('home', '/', [instance('i1', 'sym-card')]), page('about', '/about')],
      symbols: [
        symbol('sym-card', 'Card'),
        symbol('sym-list', 'List', [instance('i2', 'sym-card')]),
      ],
    });

    expect(symbolInstances(held, 'sym-card')).toEqual([
      { treeId: 'home', treeKind: 'page', treeName: 'home', nodeId: 'i1', nodeName: 'Card' },
      { treeId: 'sym-list', treeKind: 'symbol', treeName: 'List', nodeId: 'i2', nodeName: 'Card' },
    ]);
    expect(symbolInstances(held, 'sym-list')).toEqual([]);
  });

  it('deleting a symbol takes its instances with it, wherever they are', () => {
    const held = doc({
      pages: [page('home', '/', [instance('i1', 'sym-card')])],
      symbols: [
        symbol('sym-card', 'Card'),
        symbol('sym-list', 'List', [instance('i2', 'sym-card')]),
      ],
    });

    const after = deleteSymbol(held, 'sym-card');

    expect(after.symbols.map((s) => s.id)).toEqual(['sym-list']);
    expect(after.pages[0]!.nodes['i1']).toBeUndefined();
    // And the parent that held it no longer lists a child that is gone, which is what a
    // renderer walking `children` would otherwise trip over.
    expect(after.pages[0]!.nodes['home-root']!.children).toEqual([]);
    expect(after.symbols[0]!.nodes['i2']).toBeUndefined();
    expect(after.symbols[0]!.nodes['sym-list-root']!.children).toEqual([]);
  });

  it('leaves a document with no instances of it untouched', () => {
    const held = doc({ symbols: [symbol('sym-card', 'Card'), symbol('sym-list', 'List')] });
    const after = deleteSymbol(held, 'sym-card');

    expect(after.pages[0]).toBe(held.pages[0]);
    expect(after.symbols[0]).toBe(held.symbols[1]);
  });
});

describe('containment', () => {
  it('reads the dependency graph off the node types', () => {
    const held = doc({
      symbols: [
        symbol('a', 'A', [instance('n1', 'b')]),
        symbol('b', 'B', [instance('n2', 'c')]),
        symbol('c', 'C'),
      ],
    });

    expect(symbolDependencies(held).get('a')).toEqual(new Set(['b']));
    expect(symbolReaches(held, 'a', 'c')).toBe(true);
    expect(symbolReaches(held, 'c', 'a')).toBe(false);
  });

  it('refuses a component that would contain itself, directly or through another', () => {
    const held = doc({
      symbols: [symbol('a', 'A', [instance('n1', 'b')]), symbol('b', 'B'), symbol('c', 'C')],
    });

    // A page can hold anything: it is never inside something else.
    expect(canPlaceSymbol(held, 'a', null)).toBe(true);
    expect(canPlaceSymbol(held, 'a', 'a')).toBe(false);
    // A already renders B, so B may not render A.
    expect(canPlaceSymbol(held, 'a', 'b')).toBe(false);
    // Neither reaches C, so both directions are still open.
    expect(canPlaceSymbol(held, 'c', 'a')).toBe(true);
    expect(canPlaceSymbol(held, 'a', 'c')).toBe(true);
  });

  it('does not loop on a document that already contains a cycle', () => {
    const held = doc({
      symbols: [symbol('a', 'A', [instance('n1', 'b')]), symbol('b', 'B', [instance('n2', 'a')])],
    });

    expect(symbolReaches(held, 'a', 'a')).toBe(true);
  });
});

describe('the tree inside a symbol', () => {
  it('is edited by the same operations a page is, and keeps its own fields', () => {
    const held = addSymbol(doc(), symbol('sym', 'Card'));

    const after = updateSymbol(held, 'sym', (held2) =>
      renameNode(
        insertNode(held2, { node: node({ id: 'text', type: 'Text' }), parentId: 'sym-root' }),
        'text',
        'Title',
      ),
    );

    const card = getSymbol(after, 'sym');
    expect(card.nodes['text']!.name).toBe('Title');
    expect(card.nodes['sym-root']!.children).toEqual(['text']);
    // The generic operations return the type they were given — the props and the name are
    // still there, which is the whole reason `NodeTree` exists.
    expect(card.name).toBe('Card');
    expect(card.props).toEqual([]);
  });
});

describe('copying', () => {
  it('freshens node ids, keeps prop ids, and takes a free name', () => {
    const prop = {
      id: 'p1',
      name: 'title',
      label: 'Title',
      type: 'string' as const,
      defaultValue: '',
    };
    const held = doc({
      symbols: [symbol('sym', 'Card', [node({ id: 'text', type: 'Text' })], [prop])],
    });

    let count = 0;
    const copy = copySymbol(held, 'sym', () => `new${(count += 1)}`);

    expect(copy.name).toBe('Card 2');
    expect(Object.keys(copy.nodes).sort()).toEqual(['new1', 'new2']);
    expect(copy.nodes[copy.rootId]!.children).toEqual([
      Object.keys(copy.nodes).find((id) => id !== copy.rootId),
    ]);
    // Prop ids stay, exactly as a duplicated page keeps its state ids: they resolve only
    // within their own symbol, and the copied nodes' `props.title` expressions do not move.
    expect(copy.props).toEqual([prop]);
  });

  it('duplicates in place, directly after the original', () => {
    const held = doc({ symbols: [symbol('a', 'A'), symbol('b', 'B')] });
    const after = duplicateSymbol(held, 'a');

    expect(after.symbols.map((s) => s.name)).toEqual(['A', 'A 2', 'B']);
  });
});

describe('the prop surface', () => {
  const withCard = () => addSymbol(doc(), symbol('sym', 'Card'));

  it('creates a prop with a name that is free, and refuses a clash on the way in', () => {
    let held = withCard();
    const first = createSymbolProp(getSymbol(held, 'sym'), { name: 'title' }, () => 'p1');
    held = addSymbolProp(held, 'sym', first);

    const second = createSymbolProp(getSymbol(held, 'sym'), { name: 'title' }, () => 'p2');
    expect(second.name).toBe('title2');

    expect(() => addSymbolProp(held, 'sym', { ...second, name: 'title' })).toThrow(
      /already in use/,
    );
    expect(() => addSymbolProp(held, 'sym', { ...second, name: '2bad' })).toThrow(/usable/);
  });

  it('gives each type a sensible starting value', () => {
    const card = getSymbol(withCard(), 'sym');

    expect(createSymbolProp(card, { type: 'number' }).defaultValue).toBe(0);
    expect(createSymbolProp(card, { type: 'boolean' }).defaultValue).toBe(false);
    expect(createSymbolProp(card, { type: 'enum' }).defaultValue).toBe('');
  });

  it('carries a rename onto every instance, in pages and in other symbols', () => {
    let held = doc({
      pages: [page('home', '/', [instance('i1', 'sym', { title: 'Hello' })])],
      symbols: [
        symbol('sym', 'Card'),
        symbol('other', 'Other', [instance('i2', 'sym', { title: 'Hi' })]),
      ],
    });
    held = addSymbolProp(held, 'sym', {
      id: 'p1',
      name: 'title',
      label: 'Title',
      type: 'string',
      defaultValue: '',
    });

    const after = updateSymbolProp(held, 'sym', 'p1', { name: 'heading' });

    expect(after.pages[0]!.nodes['i1']!.props).toEqual({ heading: staticProp('Hello') });
    expect(after.symbols[1]!.nodes['i2']!.props).toEqual({ heading: staticProp('Hi') });
    expect(getSymbol(after, 'sym').props[0]!.name).toBe('heading');
  });

  it('does not rewrite the expressions inside the symbol that read the old name', () => {
    let held = addSymbol(
      doc(),
      symbol('sym', 'Card', [
        makeNode({
          id: 'text',
          type: 'Text',
          name: 'Text',
          props: { text: exprProp('{{ props.title }}') },
        }),
      ]),
    );
    held = addSymbolProp(held, 'sym', {
      id: 'p1',
      name: 'title',
      label: 'Title',
      type: 'string',
      defaultValue: '',
    });

    // The warning the panel shows before the rename lands. Expression text is free-form and
    // nothing may rewrite it — §10's rule, one level down.
    const usage = symbolPropUsage(getSymbol(held, 'sym'), getSymbol(held, 'sym').props[0]!);
    expect(usage.map((site) => site.path)).toEqual(['props.text']);

    const after = updateSymbolProp(held, 'sym', 'p1', { name: 'heading' });
    expect(getSymbol(after, 'sym').nodes['text']!.props['text']).toEqual(
      exprProp('{{ props.title }}'),
    );
  });

  it('removing a prop takes the value every instance stored for it', () => {
    let held = doc({
      pages: [page('home', '/', [instance('i1', 'sym', { title: 'Hello', tone: 'quiet' })])],
      symbols: [symbol('sym', 'Card')],
    });
    held = addSymbolProp(held, 'sym', {
      id: 'p1',
      name: 'title',
      label: 'Title',
      type: 'string',
      defaultValue: '',
    });

    const after = removeSymbolProp(held, 'sym', 'p1');

    expect(getSymbol(after, 'sym').props).toEqual([]);
    expect(after.pages[0]!.nodes['i1']!.props).toEqual({ tone: staticProp('quiet') });
  });

  it('reorders the surface without touching anything else', () => {
    let held = withCard();
    for (const name of ['a', 'b', 'c']) {
      held = addSymbolProp(held, 'sym', {
        id: name,
        name,
        label: name,
        type: 'string',
        defaultValue: '',
      });
    }

    expect(moveSymbolProp(held, 'sym', 2, 0).symbols[0]!.props.map((p) => p.name)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('changing a type leaves the stored values alone', () => {
    let held = doc({
      pages: [page('home', '/', [instance('i1', 'sym', { count: '3' })])],
      symbols: [symbol('sym', 'Card')],
    });
    held = addSymbolProp(held, 'sym', {
      id: 'p1',
      name: 'count',
      label: 'Count',
      type: 'string',
      defaultValue: '',
    });

    const after = updateSymbolProp(held, 'sym', 'p1', { type: 'number' });

    expect(getSymbol(after, 'sym').props[0]!.type).toBe('number');
    expect(after.pages[0]!.nodes['i1']!.props['count']).toEqual(staticProp('3'));
  });
});
