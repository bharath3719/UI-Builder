/**
 * Drop resolution for the layers tree — PLAN.md §6, the third drag surface.
 *
 * Same contract as the canvas resolver (`canvas/resolveDrop.ts`) and the same legality
 * rules (`dnd/rules.ts`); only the geometry differs. On the canvas the question is
 * "which box is the cursor in"; here every row is the same shape, so it reduces to
 * arithmetic on one row's height — which is why this is a pure function over measured
 * rects rather than something that reads the DOM.
 */

import type { NodeId, Page } from '@ui-builder/schema';
import { dropAnchor, layerName } from '../dnd/dropContext.js';
import { canReceive } from '../dnd/rules.js';
import type { DragSource, DropIndicator, DropTarget } from '../state/context.js';
import { layerIndent } from './tree.js';

/** The §6 rule, applied to a row's height: the outer quarters mean "beside", not "inside". */
const EDGE_BAND_RATIO = 0.25;

const LINE_THICKNESS = 2;

/** A visible row and where it currently is, in studio client coordinates. */
export interface MeasuredRow {
  id: NodeId;
  depth: number;
  expanded: boolean;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ResolveLayerDropArgs {
  page: Page;
  /** Every visible row, in display order. */
  rows: MeasuredRow[];
  /** The tree's scroll box. A point outside it belongs to some other surface. */
  bounds: { left: number; top: number; right: number; bottom: number };
  /** Cursor position, in studio client coordinates. */
  x: number;
  y: number;
  source: DragSource;
}

/**
 * An insertion line, drawn from the indent its future siblings sit at rather than from
 * the panel edge — the indent is what says which list the node is joining, and it is
 * the only thing distinguishing "after this child" from "after its parent".
 */
function lineAt(row: MeasuredRow, depth: number, y: number): DropIndicator {
  const left = row.left + layerIndent(depth);
  return {
    kind: 'line',
    left,
    top: y - LINE_THICKNESS / 2,
    width: Math.max(row.right - left, 1),
    height: LINE_THICKNESS,
  };
}

/**
 * The receiving container's own row, so the overlay can outline it.
 *
 * Null when that row is off screen — the tree scrolls, and an outline drawn for a row
 * that is not there would be a rectangle floating over unrelated ones.
 */
function rowRect(rows: MeasuredRow[], id: NodeId): DropTarget['context']['parentRect'] {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) return null;
  return {
    left: row.left,
    top: row.top,
    width: Math.max(row.right - row.left, 1),
    height: Math.max(row.bottom - row.top, 1),
  };
}

/** "Inside here, at the end" — the whole row highlighted, as an area rather than a gap. */
function insideTarget(page: Page, row: MeasuredRow): DropTarget {
  return {
    parentId: row.id,
    index: page.nodes[row.id]?.children.length ?? 0,
    indicator: {
      kind: 'box',
      left: row.left,
      top: row.top,
      width: Math.max(row.right - row.left, 1),
      height: Math.max(row.bottom - row.top, 1),
    },
    // The box is already drawn on the receiving row, so naming a sibling as well would
    // be two answers to one question.
    context: { parentName: layerName(page, row.id), anchor: null, parentRect: null },
  };
}

function besideTarget(
  page: Page,
  rows: MeasuredRow[],
  row: MeasuredRow,
  source: DragSource,
  edge: 'before' | 'after',
): DropTarget | null {
  const parentId = page.nodes[row.id]?.parentId;
  if (!parentId) return null;

  // Dropping *after* an open container means going inside it, first — because the next
  // row on screen is already its first child, so a line at this row's bottom edge drawn
  // at the parent's indent would be pointing at two different gaps at once.
  if (edge === 'after' && row.expanded && canReceive(page, row.id, source)) {
    return {
      parentId: row.id,
      index: 0,
      indicator: lineAt(row, row.depth + 1, row.bottom),
      context: {
        parentName: layerName(page, row.id),
        anchor: dropAnchor({
          page,
          siblings: page.nodes[row.id]?.children ?? [],
          index: 0,
          prefer: 'before',
          source,
        }),
        parentRect: rowRect(rows, row.id),
      },
    };
  }

  const siblings = page.nodes[parentId]?.children ?? [];
  const index = siblings.indexOf(row.id);
  if (index === -1) return null;

  return {
    parentId,
    // The dragged node is still in this list; `moveNode` compensates for its own
    // removal, exactly as on the canvas.
    index: edge === 'before' ? index : index + 1,
    indicator: lineAt(row, row.depth, edge === 'before' ? row.top : row.bottom),
    context: {
      parentName: layerName(page, parentId),
      anchor: dropAnchor({
        page,
        siblings,
        index: edge === 'before' ? index : index + 1,
        prefer: edge,
        source,
      }),
      parentRect: rowRect(rows, parentId),
    },
  };
}

/** The gutter below the last row: the end of the page, which is what it looks like. */
function endOfPage(page: Page, rows: MeasuredRow[], source: DragSource): DropTarget | null {
  const last = rows[rows.length - 1];
  if (!last || !canReceive(page, page.rootId, source)) return null;

  const siblings = page.nodes[page.rootId]?.children ?? [];

  return {
    parentId: page.rootId,
    index: siblings.length,
    indicator: lineAt(last, 1, last.bottom),
    context: {
      parentName: layerName(page, page.rootId),
      anchor: dropAnchor({ page, siblings, index: siblings.length, prefer: 'after', source }),
      parentRect: rowRect(rows, page.rootId),
    },
  };
}

export function resolveLayerDrop({
  page,
  rows,
  bounds,
  x,
  y,
  source,
}: ResolveLayerDropArgs): DropTarget | null {
  // A tree that is not on screen is not a drop target. Since the rail switches the
  // left panel between views rather than unmounting them, the hidden one still has a
  // resolver registered — and its bounds collapse to a zero rect at the origin, which
  // would otherwise claim a drop at exactly (0, 0).
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return null;

  if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;

  const first = rows[0];
  if (!first) return null;

  // Above the first row is the panel's own padding, not a gap in the list: the first
  // row is the page root and nothing can go beside it, so the point belongs to it.
  const row = rows.find((candidate) => y >= candidate.top && y < candidate.bottom) ?? null;
  if (!row)
    return y < first.top ? insideOrNull(page, first, source) : endOfPage(page, rows, source);

  const height = Math.max(row.bottom - row.top, 1);
  const fraction = (y - row.top) / height;

  const inside = canReceive(page, row.id, source);
  const parentId = page.nodes[row.id]?.parentId ?? null;
  const beside = parentId !== null && canReceive(page, parentId, source);

  // The page root, or a row inside a locked container: there is no "beside" to offer.
  if (!beside) return inside ? insideTarget(page, row) : null;

  if (!inside) {
    // A leaf, or the dragged node itself: no middle band to descend into, so the row
    // splits cleanly in two.
    return besideTarget(page, rows, row, source, fraction < 0.5 ? 'before' : 'after');
  }

  if (fraction < EDGE_BAND_RATIO) return besideTarget(page, rows, row, source, 'before');
  if (fraction > 1 - EDGE_BAND_RATIO) return besideTarget(page, rows, row, source, 'after');
  return insideTarget(page, row);
}

function insideOrNull(page: Page, row: MeasuredRow, source: DragSource): DropTarget | null {
  return canReceive(page, row.id, source) ? insideTarget(page, row) : null;
}
