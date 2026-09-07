/**
 * The rubber-band selection — the geometry half of it.
 *
 * Kept apart from `Canvas.tsx` for the reason `resolveDrop.ts` is: this is arithmetic
 * over rectangles, it decides something a user will argue with ("why did that one get
 * picked up?"), and it can be tested exhaustively without a DOM, an iframe or a React
 * tree. The measuring is the caller's job — it passes a function that answers "where is
 * this node?" — so nothing here has to know about projections or frames.
 */

import type { NodeId, Page } from '@ui-builder/schema';
import type { Rect } from './viewport.js';

/** The band the pointer has swept, from where it was pressed to where it is now. */
export function marqueeRect(
  origin: { x: number; y: number },
  current: { x: number; y: number },
): Rect {
  return {
    left: Math.min(origin.x, current.x),
    top: Math.min(origin.y, current.y),
    width: Math.abs(current.x - origin.x),
    height: Math.abs(current.y - origin.y),
  };
}

/**
 * Touching, not containing.
 *
 * Requiring a node to be *entirely* inside the band is the other common rule, and it is
 * the wrong one here: designs are mostly full-width rows, so a band drawn down the
 * middle of the page would select nothing at all and read as broken.
 */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

/**
 * How small a band still counts. Below this the gesture was a click that wobbled, and
 * a 2px band across a full-width row would select it — which is not what letting go
 * immediately is meant to do.
 */
export const MARQUEE_MIN_PX = 4;

export function isMarquee(rect: Rect): boolean {
  return rect.width >= MARQUEE_MIN_PX || rect.height >= MARQUEE_MIN_PX;
}

export interface MarqueeHitArgs {
  page: Page;
  band: Rect;
  /** Where a node is on screen, or null if it is not rendered (a hidden one is not). */
  rectOf: (id: NodeId) => Rect | null;
  /** Skipped along with its whole subtree — a locked node is not selectable. */
  skip?: (id: NodeId) => boolean;
}

/**
 * The nodes a band selects: the shallowest ones it touches.
 *
 * Not every node it touches, which is the other obvious reading and a bad one — a band
 * over a card would return the card *and* its heading *and* its text, so the first
 * thing the user did with their new multi-selection would be to fight it. Taking a node
 * and stopping there is also what keeps the result already-topmost, which is the shape
 * every whole-selection command wants.
 *
 * The root is never a result. It fills the artboard, so it touches every band, and a
 * marquee that always included the page would never select anything else.
 */
export function nodesInMarquee({ page, band, rectOf, skip }: MarqueeHitArgs): NodeId[] {
  const found: NodeId[] = [];

  const visit = (id: NodeId) => {
    if (skip?.(id)) return;

    const rect = rectOf(id);
    // An unmeasurable node is not on screen, but its children may be — a zero-height
    // wrapper is still a wrapper — so the walk carries on past it.
    if (rect && id !== page.rootId && intersects(rect, band)) {
      found.push(id);
      return;
    }

    for (const child of page.nodes[id]?.children ?? []) visit(child);
  };

  visit(page.rootId);
  return found;
}
