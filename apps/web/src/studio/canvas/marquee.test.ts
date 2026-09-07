import { describe, expect, it } from 'vitest';
import { makeNode, makePage, type Node, type NodeId, type Page } from '@ui-builder/schema';
import { intersects, isMarquee, marqueeRect, nodesInMarquee } from './marquee.js';
import type { Rect } from './viewport.js';

/**
 * root (0,0 400x400)
 *  ├─ card   (0,0   400x100)
 *  │   ├─ title (8,8   100x20)
 *  │   └─ body  (8,40  100x20)
 *  ├─ b      (0,200 400x40)
 *  └─ c      (0,300 400x40)
 */
function fixture(): Page {
  const nodes: Node[] = [
    makeNode({ id: 'root', type: 'Box', name: 'Page', children: ['card', 'b', 'c'] }),
    makeNode({
      id: 'card',
      parentId: 'root',
      type: 'Card',
      name: 'Card',
      children: ['title', 'body'],
    }),
    makeNode({ id: 'title', parentId: 'card', type: 'Heading', name: 'Title' }),
    makeNode({ id: 'body', parentId: 'card', type: 'Text', name: 'Body' }),
    makeNode({ id: 'b', parentId: 'root', type: 'Box', name: 'B' }),
    makeNode({ id: 'c', parentId: 'root', type: 'Box', name: 'C' }),
  ];

  return makePage({
    id: 'page',
    name: 'Home',
    path: '/',
    rootId: 'root',
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
  });
}

const RECTS: Record<string, Rect> = {
  root: { left: 0, top: 0, width: 400, height: 400 },
  card: { left: 0, top: 0, width: 400, height: 100 },
  title: { left: 8, top: 8, width: 100, height: 20 },
  body: { left: 8, top: 40, width: 100, height: 20 },
  b: { left: 0, top: 200, width: 400, height: 40 },
  c: { left: 0, top: 300, width: 400, height: 40 },
};

const rectOf = (id: NodeId) => RECTS[id] ?? null;

const hits = (band: Rect, skip?: (id: NodeId) => boolean) =>
  nodesInMarquee({ page: fixture(), band, rectOf, skip });

describe('marqueeRect', () => {
  it('normalises a band dragged up and to the left', () => {
    expect(marqueeRect({ x: 100, y: 100 }, { x: 40, y: 60 })).toEqual({
      left: 40,
      top: 60,
      width: 60,
      height: 40,
    });
  });
});

describe('isMarquee', () => {
  it('ignores the wobble in a click', () => {
    expect(isMarquee({ left: 0, top: 0, width: 2, height: 3 })).toBe(false);
    expect(isMarquee({ left: 0, top: 0, width: 2, height: 9 })).toBe(true);
  });
});

describe('intersects', () => {
  it('touching is enough, but sharing only an edge is not', () => {
    const a = { left: 0, top: 0, width: 10, height: 10 };
    expect(intersects(a, { left: 9, top: 9, width: 10, height: 10 })).toBe(true);
    expect(intersects(a, { left: 10, top: 0, width: 10, height: 10 })).toBe(false);
  });
});

describe('nodesInMarquee', () => {
  it('takes the shallowest node it touches, not everything under it', () => {
    // A band over the whole card must not also return the card's own heading and text.
    expect(hits({ left: 0, top: 0, width: 400, height: 120 })).toEqual(['card']);
  });

  it('never returns the page root, which every band touches', () => {
    expect(hits({ left: 0, top: 0, width: 400, height: 400 })).toEqual(['card', 'b', 'c']);
  });

  it('returns siblings in document order however the band was drawn', () => {
    expect(hits({ left: 0, top: 190, width: 400, height: 200 })).toEqual(['b', 'c']);
    expect(marqueeRect({ x: 400, y: 390 }, { x: 0, y: 190 })).toEqual({
      left: 0,
      top: 190,
      width: 400,
      height: 200,
    });
  });

  it('selects nothing for a band in the gap between two nodes', () => {
    expect(hits({ left: 0, top: 250, width: 400, height: 40 })).toEqual([]);
  });

  it('skips a node and its whole subtree', () => {
    // A locked card must not be selectable, and neither must its children *through*
    // it — the lock is inherited, which is what makes skipping the subtree right.
    expect(hits({ left: 0, top: 0, width: 400, height: 400 }, (id) => id === 'card')).toEqual([
      'b',
      'c',
    ]);
  });

  it('walks past a node it cannot measure to reach the ones it can', () => {
    const page = fixture();
    const band = { left: 0, top: 0, width: 400, height: 120 };
    const found = nodesInMarquee({
      page,
      band,
      rectOf: (id) => (id === 'card' ? null : (RECTS[id] ?? null)),
    });
    expect(found).toEqual(['title', 'body']);
  });
});
