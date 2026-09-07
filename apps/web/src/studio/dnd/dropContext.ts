/**
 * Naming a drop — the words half of the §6 feedback.
 *
 * The geometry lives in each surface's resolver, because a canvas and a tree measure
 * nothing alike. The *naming* is identical for both and lives here, for the same reason
 * `rules.ts` exists: two surfaces describing the same drop differently is a bug the
 * user experiences as the editor changing its mind.
 */

import type { NodeId, Page } from '@ui-builder/schema';
import type { DragSource, DropAnchor } from '../state/context.js';

/** A node's name, or a placeholder for one the page no longer has. */
export function layerName(page: Page, id: NodeId | null | undefined): string {
  return (id && page.nodes[id]?.name) || 'Layer';
}

export interface DropAnchorArgs {
  page: Page;
  /** The receiving container's children, in order. */
  siblings: readonly NodeId[];
  /** The insertion point in that list. */
  index: number;
  /**
   * Which side of the gap the indicator was drawn against.
   *
   * A gap has two equally true names — "after the one above" and "before the one
   * below" — and this picks the one that matches the edge the pointer was actually
   * near, so the label agrees with where the user is looking.
   */
  prefer: DropAnchor['edge'];
  source: DragSource;
}

export function dropAnchor({
  page,
  siblings,
  index,
  prefer,
  source,
}: DropAnchorArgs): DropAnchor | null {
  // A node cannot be a landmark for its own move: it is about to leave the gap it is
  // being named against. Skipping it walks outward to the nearest one that is staying.
  const moving = source.kind === 'move' ? source.nodeId : null;

  const back = (): DropAnchor | null => {
    for (let i = index - 1; i >= 0; i -= 1) {
      const id = siblings[i];
      if (id !== undefined && id !== moving) return { name: layerName(page, id), edge: 'after' };
    }
    return null;
  };

  const forward = (): DropAnchor | null => {
    for (let i = index; i < siblings.length; i += 1) {
      const id = siblings[i];
      if (id !== undefined && id !== moving) return { name: layerName(page, id), edge: 'before' };
    }
    return null;
  };

  return prefer === 'before' ? (forward() ?? back()) : (back() ?? forward());
}
