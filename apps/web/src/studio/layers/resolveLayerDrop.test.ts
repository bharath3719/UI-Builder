import { describe, expect, it } from 'vitest';
import { makeNode, makePage, setNodeFlags, type Node, type Page } from '@ui-builder/schema';
import type { DragSource } from '../state/context.js';
import { resolveLayerDrop, type MeasuredRow } from './resolveLayerDrop.js';
import { layerIndent } from './tree.js';

/**
 * root (Box)          rows 0
 *  ├─ stack (VStack)       1
 *  │   ├─ t1 (Text)        2
 *  │   └─ t2 (Text)        3
 *  └─ leaf (Text)          4
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

const ROW_HEIGHT = 24;
const LEFT = 100;
const RIGHT = 300;

/** Rows laid out top to bottom from y=50, matching the fixture's flattened order. */
const ROWS: MeasuredRow[] = [
  { id: 'root', depth: 0, expanded: true },
  { id: 'stack', depth: 1, expanded: true },
  { id: 't1', depth: 2, expanded: false },
  { id: 't2', depth: 2, expanded: false },
  { id: 'leaf', depth: 1, expanded: false },
].map((row, index) => ({
  ...row,
  left: LEFT,
  right: RIGHT,
  top: 50 + index * ROW_HEIGHT,
  bottom: 50 + (index + 1) * ROW_HEIGHT,
}));

const BOUNDS = { left: LEFT, top: 40, right: RIGHT, bottom: 400 };

const NEW_SOURCE: DragSource = { kind: 'new', componentKey: 'Text' };

function row(id: string): MeasuredRow {
  const found = ROWS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

/** A point at a fraction of the named row's height, horizontally centred. */
function at(id: string, fraction: number) {
  return { x: (LEFT + RIGHT) / 2, y: row(id).top + ROW_HEIGHT * fraction };
}

function resolve(
  point: { x: number; y: number },
  source: DragSource = NEW_SOURCE,
  page = fixture(),
) {
  return resolveLayerDrop({ page, rows: ROWS, bounds: BOUNDS, source, ...point });
}

describe('bounds', () => {
  it('declines a point outside the tree, so another surface can answer', () => {
    expect(resolve({ x: LEFT - 1, y: 60 })).toBeNull();
    expect(resolve({ x: (LEFT + RIGHT) / 2, y: BOUNDS.bottom + 1 })).toBeNull();
  });

  it('declines when the tree is not on screen at all', () => {
    // The rail leaves the inactive view mounted, so its resolver is still registered
    // and its bounds have collapsed to a zero rect at the origin.
    expect(
      resolveLayerDrop({
        page: fixture(),
        rows: ROWS,
        bounds: { left: 0, top: 0, right: 0, bottom: 0 },
        source: NEW_SOURCE,
        x: 0,
        y: 0,
      }),
    ).toBeNull();
  });

  it('declines when there is nothing to drop onto', () => {
    expect(
      resolveLayerDrop({
        page: fixture(),
        rows: [],
        bounds: BOUNDS,
        x: 200,
        y: 60,
        source: NEW_SOURCE,
      }),
    ).toBeNull();
  });
});

describe('beside a row', () => {
  it('inserts before it from the top quarter', () => {
    expect(resolve(at('leaf', 0.1))).toMatchObject({ parentId: 'root', index: 1 });
  });

  it('inserts after it from the bottom quarter', () => {
    expect(resolve(at('leaf', 0.9))).toMatchObject({ parentId: 'root', index: 2 });
  });

  it('splits a leaf in half, with no middle band to descend into', () => {
    expect(resolve(at('t1', 0.4))).toMatchObject({ parentId: 'stack', index: 0 });
    expect(resolve(at('t1', 0.6))).toMatchObject({ parentId: 'stack', index: 1 });
  });

  it('draws the line at the indent of the list being joined', () => {
    expect(resolve(at('t1', 0.1))?.indicator).toEqual({
      kind: 'line',
      left: LEFT + layerIndent(2),
      top: row('t1').top - 1,
      width: RIGHT - LEFT - layerIndent(2),
      height: 2,
    });
  });
});

describe('inside a container', () => {
  it('appends from the middle band', () => {
    expect(resolve(at('stack', 0.5))).toMatchObject({ parentId: 'stack', index: 2 });
  });

  it('highlights the row itself rather than a gap', () => {
    expect(resolve(at('stack', 0.5))?.indicator).toEqual({
      kind: 'box',
      left: LEFT,
      top: row('stack').top,
      width: RIGHT - LEFT,
      height: ROW_HEIGHT,
    });
  });

  it('reads "after an open container" as "inside it, first"', () => {
    const target = resolve(at('stack', 0.9));
    expect(target).toMatchObject({ parentId: 'stack', index: 0 });
    // One level deeper than the container's own row: the line has to point at the gap
    // above `t1`, not at the gap below the whole stack.
    expect(target?.indicator).toMatchObject({ left: LEFT + layerIndent(2) });
  });

  it('reads "after a closed container" as "next to it"', () => {
    const rows = ROWS.map((row) => (row.id === 'stack' ? { ...row, expanded: false } : row));
    const target = resolveLayerDrop({
      page: fixture(),
      rows,
      bounds: BOUNDS,
      ...at('stack', 0.9),
      source: NEW_SOURCE,
    });

    expect(target).toMatchObject({ parentId: 'root', index: 1 });
  });
});

describe('the page root', () => {
  it('has no "beside", so its whole row means "inside"', () => {
    expect(resolve(at('root', 0.1))).toMatchObject({ parentId: 'root', index: 2 });
    expect(resolve(at('root', 0.9))).toMatchObject({ parentId: 'root', index: 2 });
  });

  it('takes the drop in the gutter below the last row', () => {
    const target = resolve({ x: 200, y: row('leaf').bottom + 30 });
    expect(target).toMatchObject({ parentId: 'root', index: 2 });
    // Drawn where the new row would appear: under the last one, at child indent.
    expect(target?.indicator).toMatchObject({ left: LEFT + layerIndent(1) });
  });

  it('takes a point in the padding above the first row', () => {
    expect(resolve({ x: 200, y: BOUNDS.top + 1 })).toMatchObject({ parentId: 'root', index: 2 });
  });
});

describe('what the drop is next to', () => {
  it('names the row the line was drawn against, from either side of it', () => {
    expect(resolve(at('leaf', 0.1))?.context).toMatchObject({
      parentName: 'Page',
      anchor: { name: 'Leaf', edge: 'before' },
    });
    expect(resolve(at('leaf', 0.9))?.context).toMatchObject({
      anchor: { name: 'Leaf', edge: 'after' },
    });
  });

  it('names only the container when the whole row is the target', () => {
    expect(resolve(at('stack', 0.5))?.context).toMatchObject({
      parentName: 'Stack',
      anchor: null,
    });
  });

  it('outlines the receiving row', () => {
    expect(resolve(at('t1', 0.1))?.context.parentRect).toEqual({
      left: LEFT,
      top: row('stack').top,
      width: RIGHT - LEFT,
      height: ROW_HEIGHT,
    });
  });

  it('reaches past the node being dragged, which is not staying to be next to', () => {
    const moveStack: DragSource = { kind: 'move', nodeId: 'stack' };
    expect(resolve(at('stack', 0.4), moveStack)?.context.anchor).toEqual({
      name: 'Leaf',
      edge: 'before',
    });
  });
});

describe('guards', () => {
  const moveStack: DragSource = { kind: 'move', nodeId: 'stack' };

  it('refuses every row inside the dragged subtree', () => {
    expect(resolve(at('t1', 0.5), moveStack)).toBeNull();
    expect(resolve(at('t2', 0.1), moveStack)).toBeNull();
  });

  it('still allows dropping the dragged node beside itself', () => {
    expect(resolve(at('stack', 0.4), moveStack)).toMatchObject({ parentId: 'root', index: 0 });
    expect(resolve(at('stack', 0.6), moveStack)).toMatchObject({ parentId: 'root', index: 1 });
  });

  it('will not drop into a locked container', () => {
    const page = setNodeFlags(fixture(), 'stack', { locked: true });
    expect(resolve(at('stack', 0.5), NEW_SOURCE, page)).toMatchObject({
      parentId: 'root',
      index: 1,
    });
  });

  it('will not drop beside a node whose parent is locked', () => {
    const page = setNodeFlags(fixture(), 'stack', { locked: true });
    expect(resolve(at('t1', 0.1), NEW_SOURCE, page)).toBeNull();
  });
});
