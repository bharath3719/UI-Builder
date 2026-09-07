/**
 * The shape of the layers outline.
 *
 * Flattening lives apart from the component because three things need the same list in
 * the same order: what is rendered, what the arrow keys step through, and what a drop
 * is resolved against. Deriving it three times is how they come to disagree.
 */

import type { NodeId, Page } from '@ui-builder/schema';

/**
 * Row geometry, in one place because two things depend on it and they must match: the
 * row's own padding, and the left edge of the insertion line a drop draws at that
 * depth. A line that does not start where its future siblings start reads as pointing
 * at the wrong list.
 */
export const LAYER_INSET_PX = 6;
export const LAYER_INDENT_PX = 12;

export function layerIndent(depth: number): number {
  return LAYER_INSET_PX + depth * LAYER_INDENT_PX;
}

export interface LayerRow {
  id: NodeId;
  /** 0 for the page root. */
  depth: number;
  hasChildren: boolean;
  /** Has children *and* is not collapsed — i.e. its children are rows of their own. */
  expanded: boolean;
}

/**
 * Depth-first pre-order, skipping whatever is collapsed.
 *
 * Collapse is stored as the exception rather than expansion as the rule, so a node that
 * has just been dropped into a container is visible without anyone having to remember
 * to expand its new parent.
 */
export function flattenTree(page: Page, collapsed: ReadonlySet<NodeId>): LayerRow[] {
  const rows: LayerRow[] = [];
  const seen = new Set<NodeId>();

  const walk = (id: NodeId, depth: number) => {
    const node = page.nodes[id];
    // A document from the API is validated for shape, not for acyclicity, and a cycle
    // here would hang the studio rather than show a broken tree.
    if (!node || seen.has(id)) return;
    seen.add(id);

    const hasChildren = node.children.length > 0;
    const expanded = hasChildren && !collapsed.has(id);
    rows.push({ id, depth, hasChildren, expanded });

    if (expanded) {
      for (const childId of node.children) walk(childId, depth + 1);
    }
  };

  walk(page.rootId, 0);
  return rows;
}
