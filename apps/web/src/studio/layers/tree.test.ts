import { describe, expect, it } from 'vitest';
import { getNode, makeNode, makePage, type Node, type Page } from '@ui-builder/schema';
import { flattenTree, layerIndent, LAYER_INDENT_PX, LAYER_INSET_PX } from './tree.js';

/**
 * root
 *  ├─ stack
 *  │   ├─ t1
 *  │   └─ t2
 *  └─ leaf
 */
function fixture(): Page {
  const nodes: Node[] = [
    makeNode({ id: 'root', type: 'Box', name: 'Page', children: ['stack', 'leaf'] }),
    makeNode({
      id: 'stack',
      parentId: 'root',
      type: 'VStack',
      name: 'Stack',
      children: ['t1', 't2'],
    }),
    makeNode({ id: 't1', parentId: 'stack', type: 'Text', name: 'T1' }),
    makeNode({ id: 't2', parentId: 'stack', type: 'Text', name: 'T2' }),
    makeNode({ id: 'leaf', parentId: 'root', type: 'Text', name: 'Leaf' }),
  ];

  return makePage({
    id: 'page',
    name: 'Home',
    path: '/',
    rootId: 'root',
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
  });
}

const ids = (page: Page, collapsed: string[] = []) =>
  flattenTree(page, new Set(collapsed)).map((row) => row.id);

describe('flattenTree', () => {
  it('walks depth-first, in document order', () => {
    expect(ids(fixture())).toEqual(['root', 'stack', 't1', 't2', 'leaf']);
  });

  it('reports depth from the root', () => {
    expect(flattenTree(fixture(), new Set()).map((row) => row.depth)).toEqual([0, 1, 2, 2, 1]);
  });

  it('omits the children of a collapsed node but keeps the node', () => {
    expect(ids(fixture(), ['stack'])).toEqual(['root', 'stack', 'leaf']);
  });

  it('treats everything as expanded by default, so a fresh drop is visible', () => {
    const rows = flattenTree(fixture(), new Set());
    expect(rows.find((row) => row.id === 'stack')).toMatchObject({
      hasChildren: true,
      expanded: true,
    });
  });

  it('is neither expanded nor collapsible without children', () => {
    expect(flattenTree(fixture(), new Set()).find((row) => row.id === 'leaf')).toMatchObject({
      hasChildren: false,
      expanded: false,
    });
  });

  it('collapsing a childless node changes nothing', () => {
    expect(ids(fixture(), ['leaf'])).toEqual(['root', 'stack', 't1', 't2', 'leaf']);
  });

  it('survives a cycle rather than hanging', () => {
    const page = fixture();
    // Not reachable through `ops`, but a document can arrive from the API.
    page.nodes.t1 = { ...getNode(page, 't1'), children: ['stack'] };

    expect(ids(page)).toEqual(['root', 'stack', 't1', 't2', 'leaf']);
  });

  it('skips a child id with no node behind it', () => {
    const page = fixture();
    page.nodes.root = { ...getNode(page, 'root'), children: ['stack', 'ghost', 'leaf'] };

    expect(ids(page)).toEqual(['root', 'stack', 't1', 't2', 'leaf']);
  });
});

describe('layerIndent', () => {
  it('is one step per level, from the row inset', () => {
    expect(layerIndent(0)).toBe(LAYER_INSET_PX);
    expect(layerIndent(2)).toBe(LAYER_INSET_PX + 2 * LAYER_INDENT_PX);
  });
});
