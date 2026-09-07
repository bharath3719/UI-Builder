/**
 * The pointer-driven drag session — PLAN.md §6.
 *
 * Pointer events rather than HTML5 drag-and-drop, for three reasons the plan already
 * settled: the drag image is ours (HTML5's is a browser screenshot we cannot style),
 * the drop indicator can update on every frame rather than only on `dragover`, and
 * `Escape` can cancel a drag mid-flight.
 *
 * The complication a canvas-in-an-iframe adds is that one gesture crosses two
 * documents. A press in the palette is captured in the studio's document; a press on
 * the canvas is captured in the frame's. Either way the pointer can then travel into
 * the other one, and neither document sees the other's events — so a session listens
 * on both and each surface converts its own coordinates into studio space.
 */

import { frameProjection, toStudioPoint } from '../canvas/viewport.js';
import { DRAG_THRESHOLD_PX } from '../state/StudioProvider.js';
import type { DragSource, StudioState } from '../state/context.js';

export interface DragSurface {
  doc: Document;
  /** Converts a pointer event in this document to studio client coordinates. */
  toStudio: (event: PointerEvent) => { x: number; y: number };
}

/** The studio's own document, where pointer coordinates are already studio space. */
export function studioSurface(): DragSurface {
  return { doc: document, toStudio: (event) => ({ x: event.clientX, y: event.clientY }) };
}

/**
 * A canvas frame's document, whose pointer coordinates are in frame space.
 *
 * The projection is rebuilt per event rather than captured once: a panel resize, a pan
 * or a zoom during the drag all move the frame, and a stale offset or scale would put
 * the drop indicator somewhere the cursor is not.
 */
export function frameSurface(doc: Document, getZoom: () => number): DragSurface | null {
  if (!doc.defaultView?.frameElement) return null;

  return {
    doc,
    toStudio: (event) => {
      const projection = frameProjection(doc, getZoom());
      if (!projection) return { x: event.clientX, y: event.clientY };
      return toStudioPoint(event.clientX, event.clientY, projection);
    },
  };
}

export interface DragSessionArgs {
  studio: StudioState;
  source: DragSource;
  label: string;
  /** Where the press happened, in studio client coordinates. */
  origin: { x: number; y: number };
  surfaces: DragSurface[];
  /** Ran when the gesture ends without ever passing the movement threshold. */
  onClick?: () => void;
}

/**
 * Starts listening for a gesture that may or may not become a drag.
 *
 * Nothing happens until the pointer has travelled far enough to mean it: below the
 * threshold the gesture is still a click, which is how the same press can both select
 * a node and start moving it.
 */
export function beginDragSession({
  studio,
  source,
  label,
  origin,
  surfaces,
  onClick,
}: DragSessionArgs): void {
  let started = false;
  let disposed = false;

  const finish = (commit: boolean) => {
    if (disposed) return;
    disposed = true;

    for (const { doc } of surfaces) {
      doc.removeEventListener('pointermove', onPointerMove, true);
      doc.removeEventListener('pointerup', onPointerUp, true);
      doc.removeEventListener('pointercancel', onPointerCancel, true);
      doc.removeEventListener('keydown', onKeyDown, true);
    }

    if (started) studio.endDrag(commit);
    else if (commit) onClick?.();
  };

  function onPointerMove(this: Document, event: Event) {
    const pointer = event as PointerEvent;
    const surface = surfaces.find((candidate) => candidate.doc === this);
    if (!surface) return;

    const point = surface.toStudio(pointer);

    if (!started) {
      const travelled = Math.hypot(point.x - origin.x, point.y - origin.y);
      if (travelled < DRAG_THRESHOLD_PX) return;
      started = true;
      studio.beginDrag(source, label, point.x, point.y);
      return;
    }

    studio.moveDrag(point.x, point.y);
  }

  function onPointerUp() {
    finish(true);
  }

  function onPointerCancel() {
    finish(false);
  }

  function onKeyDown(event: Event) {
    if ((event as KeyboardEvent).key === 'Escape') finish(false);
  }

  for (const { doc } of surfaces) {
    // Capture phase throughout: a drag must not be stoppable by anything in the tree
    // it happens to pass over, and the canvas deliberately swallows plain clicks.
    doc.addEventListener('pointermove', onPointerMove, true);
    doc.addEventListener('pointerup', onPointerUp, true);
    doc.addEventListener('pointercancel', onPointerCancel, true);
    doc.addEventListener('keydown', onKeyDown, true);
  }
}
