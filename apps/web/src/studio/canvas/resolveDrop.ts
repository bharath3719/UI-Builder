/**
 * Drop resolution — PLAN.md §6.
 *
 * Turns a cursor position into "which container, at which index", plus the geometry
 * of the line to draw for it. Kept apart from React so the rules can be reasoned
 * about (and later tested) as arithmetic rather than as a component.
 *
 * The whole thing runs on every pointermove, so it does no allocation beyond the
 * rects it has to measure, and it measures only the hovered container's children —
 * never the whole tree.
 */

import type { ComponentSpec } from '@ui-builder/components';
import { NODE_ID_ATTRIBUTE } from '@ui-builder/runtime';
import type { NodeId, Page } from '@ui-builder/schema';
import { dropAnchor, layerName } from '../dnd/dropContext.js';
import { canReceive } from '../dnd/rules.js';
import type { DragSource, DropTarget } from '../state/context.js';
import {
  scaleLength,
  toFrameSpace,
  toStudioPoint,
  toStudioSpace,
  type Projection,
} from './viewport.js';

/**
 * How close to a container's own edge counts as "beside it" rather than "inside it".
 *
 * Measured in *frame* pixels, because it is a statement about the design — the outer
 * quarter of a card is the same part of that card whatever the canvas is zoomed to. A
 * band in studio pixels would swallow a whole small container at 300%.
 */
const EDGE_BAND_MAX_PX = 16;
const EDGE_BAND_RATIO = 0.25;

/** Chrome, not design: an indicator line is 2 studio pixels at every zoom level. */
const LINE_THICKNESS = 2;

type Axis = 'horizontal' | 'vertical';

export interface ResolveDropArgs {
  /** The canvas iframe's document. */
  doc: Document;
  page: Page;
  /** Where the frame has ended up on screen, and what it is scaled by. */
  projection: Projection;
  /** Cursor position, in studio client coordinates. */
  x: number;
  y: number;
  source: DragSource;
}

function elementFor(doc: Document, id: NodeId): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`[${NODE_ID_ATTRIBUTE}="${CSS.escape(id)}"]`);
}

function nodeIdOf(element: Element | null): NodeId | null {
  const owner = element?.closest(`[${NODE_ID_ATTRIBUTE}]`);
  return owner?.getAttribute(NODE_ID_ATTRIBUTE) ?? null;
}

/**
 * The axis children are laid out along. Anything that is not an explicit row is
 * treated as vertical, which is the right answer for block flow as well as for
 * `flex-direction: column`.
 */
function axisOf(element: HTMLElement): Axis {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return 'vertical';

  if (style.display.includes('flex')) {
    return style.flexDirection.startsWith('row') ? 'horizontal' : 'vertical';
  }
  if (style.display.includes('grid')) {
    return style.gridAutoFlow.startsWith('column') ? 'horizontal' : 'vertical';
  }
  return 'vertical';
}

/** Walks up the document tree to the nearest node that can receive the drag. */
function nearestContainer(page: Page, from: NodeId, source: DragSource): NodeId | null {
  let current: NodeId | null = from;
  while (current) {
    if (canReceive(page, current, source)) return current;
    current = page.nodes[current]?.parentId ?? null;
  }
  return null;
}

interface Band {
  start: number;
  end: number;
  cross: { start: number; end: number };
}

function bandOf(rect: DOMRect, axis: Axis): Band {
  return axis === 'vertical'
    ? { start: rect.top, end: rect.bottom, cross: { start: rect.left, end: rect.right } }
    : { start: rect.left, end: rect.right, cross: { start: rect.top, end: rect.bottom } };
}

/**
 * The gap line, given a position and extent measured inside the frame.
 *
 * The line's *length* is part of the design and scales with it; its *thickness* is
 * editor chrome and does not, which is why the two are computed differently rather than
 * one rect being projected.
 */
function lineIndicator(
  axis: Axis,
  position: number,
  cross: { start: number; end: number },
  projection: Projection,
): DropTarget['indicator'] {
  const span = Math.max(scaleLength(cross.end - cross.start, projection), 1);

  if (axis === 'vertical') {
    const origin = toStudioPoint(cross.start, position, projection);
    return {
      kind: 'line',
      left: origin.x,
      top: origin.y - LINE_THICKNESS / 2,
      width: span,
      height: LINE_THICKNESS,
    };
  }

  const origin = toStudioPoint(position, cross.start, projection);
  return {
    kind: 'line',
    left: origin.x - LINE_THICKNESS / 2,
    top: origin.y,
    width: LINE_THICKNESS,
    height: span,
  };
}

export function resolveDrop({
  doc,
  page,
  projection,
  x,
  y,
  source,
}: ResolveDropArgs): DropTarget | null {
  // §5.5: the frame is asked in its own coordinates. Everything measured from here on
  // is in frame space, and only the indicators come back out of it.
  const point = toFrameSpace(x, y, projection);

  const hit = doc.elementFromPoint(point.x, point.y);
  // Outside the artboard entirely, or over the page background: fall back to the root
  // so a drop into empty space still lands somewhere sensible.
  const hitId = nodeIdOf(hit) ?? page.rootId;

  const containerId = nearestContainer(page, hitId, source);
  if (!containerId) return null;

  const containerEl = elementFor(doc, containerId);
  if (!containerEl) return null;

  /* --- Beside, rather than inside ------------------------------------------
     Near a container's leading or trailing edge the intent is almost always "put
     this next to that", not "put this inside it" — which is the outer 25% of the
     §6 rule, applied to the container the hit-test landed on. */
  const parentId = page.nodes[containerId]?.parentId ?? null;
  if (parentId && canReceive(page, parentId, source)) {
    const parentEl = elementFor(doc, parentId);
    if (parentEl) {
      const parentAxis = axisOf(parentEl);
      const band = bandOf(containerEl.getBoundingClientRect(), parentAxis);
      const size = band.end - band.start;
      const edge = Math.min(EDGE_BAND_MAX_PX, size * EDGE_BAND_RATIO);
      const along = parentAxis === 'vertical' ? point.y : point.x;

      if (size > 0 && (along < band.start + edge || along > band.end - edge)) {
        const siblings = page.nodes[parentId]?.children ?? [];
        const ownIndex = siblings.indexOf(containerId);
        if (ownIndex !== -1) {
          const before = along < band.start + edge;
          const index = before ? ownIndex : ownIndex + 1;
          return {
            parentId,
            index,
            indicator: lineIndicator(
              parentAxis,
              before ? band.start : band.end,
              band.cross,
              projection,
            ),
            context: {
              parentName: layerName(page, parentId),
              // Preferring the edge the pointer is on names the container that was hit
              // — which is the one the user is aiming beside — rather than whatever
              // happens to sit on the other side of the same gap.
              anchor: dropAnchor({
                page,
                siblings,
                index,
                prefer: before ? 'before' : 'after',
                source,
              }),
              parentRect: toStudioSpace(parentEl.getBoundingClientRect(), projection),
            },
          };
        }
      }
    }
  }

  /* --- Inside, between children -------------------------------------------- */
  const axis = axisOf(containerEl);
  const children = page.nodes[containerId]?.children ?? [];

  const measured: { id: NodeId; band: Band }[] = [];
  for (const childId of children) {
    const element = elementFor(doc, childId);
    if (!element) continue; // hidden, or not yet painted
    measured.push({ id: childId, band: bandOf(element.getBoundingClientRect(), axis) });
  }

  const containerRect = toStudioSpace(containerEl.getBoundingClientRect(), projection);

  if (measured.length === 0) {
    return {
      parentId: containerId,
      index: 0,
      indicator: { kind: 'box', ...containerRect },
      // Nothing to be beside: the box is already saying "inside here", and the label
      // only has to name the here.
      context: { parentName: layerName(page, containerId), anchor: null, parentRect: null },
    };
  }

  const along = axis === 'vertical' ? point.y : point.x;

  // The dragged node is still in the list it is being dragged within, and the index
  // this returns counts it — `moveNode` is what compensates for the removal.
  let index = measured.length;
  for (let i = 0; i < measured.length; i += 1) {
    const entry = measured[i];
    if (!entry) continue;
    if (along < (entry.band.start + entry.band.end) / 2) {
      index = i;
      break;
    }
  }

  const anchor = index < measured.length ? measured[index] : measured[measured.length - 1];
  if (!anchor) return null;

  const position = index < measured.length ? anchor.band.start : anchor.band.end;

  // The line spans the container's content, not just the child it sits beside, so it
  // reads as a gap in the layout rather than as a mark on one element.
  const containerBand = bandOf(containerEl.getBoundingClientRect(), axis);

  return {
    parentId: containerId,
    index,
    indicator: lineIndicator(axis, position, containerBand.cross, projection),
    context: {
      parentName: layerName(page, containerId),
      anchor: dropAnchor({
        page,
        // The measured list, not the container's children: a child that did not render
        // has no edge on screen, so naming it would point at nothing.
        siblings: measured.map((entry) => entry.id),
        index,
        prefer: index < measured.length ? 'before' : 'after',
        source,
      }),
      parentRect: containerRect,
    },
  };
}

/**
 * The label the drag ghost shows for a source.
 *
 * `specFor` rather than `getSpec`, so dragging one of the document's own components shows
 * its name instead of the word "Component".
 */
export function dragLabel(
  page: Page,
  source: DragSource,
  specFor: (type: string) => ComponentSpec | undefined,
): string {
  if (source.kind === 'new') return specFor(source.componentKey)?.displayName ?? 'Component';
  return page.nodes[source.nodeId]?.name ?? 'Layer';
}
