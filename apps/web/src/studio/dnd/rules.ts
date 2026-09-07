/**
 * What a drag is *allowed* to do — PLAN.md §6.
 *
 * The canvas and the layers tree work out *where* a drop lands very differently: one
 * hit-tests rendered boxes inside an iframe, the other walks rows in a list. They must
 * still agree on what is legal, or the indicator promises a drop that the commit then
 * refuses. So the geometry stays in each resolver and the legality lives here, in the
 * one module both of them import.
 */

import { acceptsChildren } from '@ui-builder/components';
import { isDescendant, isLocked, type NodeId, type Page } from '@ui-builder/schema';
import type { DragSource } from '../state/context.js';

/**
 * Whether a node can receive this drag.
 *
 * The descendant guard is here rather than only at commit time so the indicator never
 * draws a drop that would be rejected — the feedback and the rule are the same check.
 *
 * `acceptsChildren` is asked without the document's symbols, and that is deliberate rather
 * than an omission: an instance answers `false` either way — what is inside a symbol
 * belongs to the symbol, so a drop there would be a child of nothing — and so does a type
 * this build cannot resolve at all. The one symbol rule that is *not* about a node is
 * "a component may not contain itself", and it is not asked here because it is a fact
 * about the whole surface: the palette declines to offer such a component, so the drag
 * never starts (`endDrag` keeps the check anyway, since the document can change mid-drag).
 */
export function canReceive(page: Page, id: NodeId, source: DragSource): boolean {
  if (!acceptsChildren(page.nodes[id]?.type ?? '')) return false;
  if (isLocked(page, id)) return false;

  if (source.kind === 'move') {
    if (id === source.nodeId) return false;
    if (isDescendant(page, source.nodeId, id)) return false;
  }

  return true;
}

/**
 * Whether a node can be picked up at all.
 *
 * The root is the page itself and has nowhere to go; a locked node is pinned where it
 * is, which is the whole point of locking it.
 */
export function canDrag(page: Page, id: NodeId): boolean {
  const node = page.nodes[id];
  return node !== undefined && node.parentId !== null && !isLocked(page, id);
}
