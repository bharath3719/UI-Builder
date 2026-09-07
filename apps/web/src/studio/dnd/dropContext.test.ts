import { describe, expect, it } from 'vitest';
import { makeNode, makePage, type Node, type Page } from '@ui-builder/schema';
import type { DragSource } from '../state/context.js';
import { dropAnchor, layerName } from './dropContext.js';

/** root ─ [a, b, c] */
function fixture(): Page {
  const nodes: Node[] = [
    makeNode({ id: 'root', type: 'Box', name: 'Page', children: ['a', 'b', 'c'] }),
    makeNode({ id: 'a', parentId: 'root', type: 'Text', name: 'Heading' }),
    makeNode({ id: 'b', parentId: 'root', type: 'Text', name: 'Body' }),
    makeNode({ id: 'c', parentId: 'root', type: 'Text', name: 'Footer' }),
  ];

  return makePage({
    id: 'page',
    name: 'Home',
    path: '/',
    rootId: 'root',
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
  });
}

const SIBLINGS = ['a', 'b', 'c'];
const NEW_SOURCE: DragSource = { kind: 'new', componentKey: 'Text' };

function anchor(index: number, prefer: 'before' | 'after', source: DragSource = NEW_SOURCE) {
  return dropAnchor({ page: fixture(), siblings: SIBLINGS, index, prefer, source });
}

describe('dropAnchor', () => {
  it('names the neighbour on the side the indicator was drawn against', () => {
    // The same gap, from both sides.
    expect(anchor(1, 'before')).toEqual({ name: 'Body', edge: 'before' });
    expect(anchor(1, 'after')).toEqual({ name: 'Heading', edge: 'after' });
  });

  it('falls back to the other side at the ends of the list', () => {
    expect(anchor(0, 'after')).toEqual({ name: 'Heading', edge: 'before' });
    expect(anchor(3, 'before')).toEqual({ name: 'Footer', edge: 'after' });
  });

  it('never names the node being dragged', () => {
    const moveB: DragSource = { kind: 'move', nodeId: 'b' };

    // Both edges of b's own gap would be b, so the label reaches past it.
    expect(anchor(1, 'before', moveB)).toEqual({ name: 'Footer', edge: 'before' });
    expect(anchor(2, 'after', moveB)).toEqual({ name: 'Heading', edge: 'after' });
  });

  it('has nothing to name in an empty container', () => {
    expect(
      dropAnchor({ page: fixture(), siblings: [], index: 0, prefer: 'before', source: NEW_SOURCE }),
    ).toBeNull();
  });
});

describe('layerName', () => {
  it('falls back for a node the page no longer has', () => {
    expect(layerName(fixture(), 'a')).toBe('Heading');
    expect(layerName(fixture(), 'gone')).toBe('Layer');
    expect(layerName(fixture(), null)).toBe('Layer');
  });
});
