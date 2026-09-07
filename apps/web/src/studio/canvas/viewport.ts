/**
 * The canvas viewport — PLAN.md §5.3 and §5.4.
 *
 * Three coordinate spaces meet on the canvas and only two of them are the same:
 *
 * - **frame space** — what `getBoundingClientRect()` returns *inside* the iframe. The
 *   design's own pixels, unaffected by anything the studio does to the frame.
 * - **area space** — offsets from the top-left of the scrollport the artboard floats in.
 *   The viewport's `x`/`y` live here.
 * - **studio space** — client coordinates in the studio's document. Overlays, the drop
 *   indicator and the drag ghost are all positioned in it.
 *
 * Every conversion between them lives in this file. §5.3's rule is that the zoom factor
 * is never applied inline at a call site, because a single overlay that multiplies by
 * `zoom` in its own way is exactly how a canvas ends up with outlines that drift at 60%
 * and are fine at 100%. Nothing outside this module should mention `zoom` in arithmetic.
 *
 * The one thing that is *not* here: the pan offset never appears in a conversion. The
 * transform is applied by the browser to a real element, so the frame's own
 * `getBoundingClientRect()` already accounts for it — a projection only has to add back
 * the scale, which the rects measured inside the frame do not know about.
 */

import type { Theme } from '@ui-builder/schema';

export interface Viewport {
  /** Scale of the artboard. 1 is 100%. */
  zoom: number;
  /** The artboard's top-left corner in area space, before scaling. */
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The artboard's size in frame space.
 *
 * Fixed rather than "however big the panel is", because a design's width is a property
 * of the design: a layout that reflows when the inspector is resized cannot be judged.
 * Phase 9's device presets are a control over this number, not a change to the model.
 */
export const ARTBOARD_SIZE: Size = { width: 1024, height: 768 };

/** The narrowest artboard worth offering — below this nothing is legible. */
export const ARTBOARD_MIN_WIDTH = 240;
export const ARTBOARD_MAX_WIDTH = 2560;

/**
 * The width to show a breakpoint at.
 *
 * A breakpoint's own `minWidth` is the narrowest width at which its rules apply, so
 * it is exactly the width that proves they do — `md` previewed at 768 is the moment
 * the tablet layout takes over. `base` has no width of its own and keeps the default
 * artboard, since it is the layout that applies at every width rather than one.
 */
export function artboardWidthFor(theme: Theme, breakpointId: string): number {
  if (breakpointId === 'base') return ARTBOARD_SIZE.width;
  const breakpoint = theme.breakpoints.find((entry) => entry.id === breakpointId);
  return breakpoint && breakpoint.minWidth > 0 ? breakpoint.minWidth : ARTBOARD_SIZE.width;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

/** The stops the +/− buttons and ⌘+/⌘− walk between. */
export const ZOOM_STOPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

/** Breathing room between the artboard and the edge of the area, in studio pixels. */
export const FIT_PADDING_PX = 32;

/** Zoom is compared with a tolerance: it arrives from wheel arithmetic, not from a list. */
const EPSILON = 1e-4;

export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, x: 0, y: 0 };

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** The `transform` for the element the artboard sits in. Origin `0 0` — see §5.4. */
export function sceneTransform(view: Viewport): string {
  return `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
}

/**
 * Zooms so that the artboard point currently under `anchor` stays under it.
 *
 * Zooming about the centre of the panel instead is the thing that makes a canvas feel
 * like it is fighting back: the region being worked on slides away exactly when it is
 * being looked at. `anchor` is in area space — usually the cursor, or the middle of the
 * area for a keyboard or toolbar zoom.
 */
export function zoomAt(view: Viewport, zoom: number, anchor: { x: number; y: number }): Viewport {
  const next = clampZoom(zoom);
  if (next === view.zoom) return view;

  // The anchor's offset from the artboard origin scales with the zoom; keeping the
  // point fixed means absorbing the difference into the pan.
  const ratio = next / view.zoom;
  return {
    zoom: next,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  };
}

export function panBy(view: Viewport, dx: number, dy: number): Viewport {
  if (dx === 0 && dy === 0) return view;
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/** The next stop above (`1`) or below (`-1`) the current zoom. */
export function steppedZoom(zoom: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STOPS.find((stop) => stop > zoom + EPSILON) ?? ZOOM_MAX;
  }
  for (let i = ZOOM_STOPS.length - 1; i >= 0; i -= 1) {
    const stop = ZOOM_STOPS[i];
    if (stop !== undefined && stop < zoom - EPSILON) return stop;
  }
  return ZOOM_MIN;
}

/**
 * Centres an artboard of the given zoom in the area.
 *
 * When the scaled artboard is larger than the area, it is pinned to the padding rather
 * than centred: a negative offset would hide the top-left corner, which is where a page
 * is read from and where its root's selection label sits.
 */
export function centreIn(area: Size, zoom: number, content: Size = ARTBOARD_SIZE): Viewport {
  const width = content.width * zoom;
  const height = content.height * zoom;
  return {
    zoom,
    x: Math.max(FIT_PADDING_PX, (area.width - width) / 2),
    y: Math.max(FIT_PADDING_PX, (area.height - height) / 2),
  };
}

/**
 * The largest zoom at which the whole artboard is visible, centred.
 *
 * Capped at 100%: scaling a design *up* to fill a wide monitor would make every
 * judgement about type size wrong, and "fit" is asked for to see the whole page, not to
 * magnify it.
 */
export function fitTo(area: Size, content: Size = ARTBOARD_SIZE): Viewport {
  const usableWidth = Math.max(area.width - FIT_PADDING_PX * 2, 1);
  const usableHeight = Math.max(area.height - FIT_PADDING_PX * 2, 1);
  const zoom = clampZoom(Math.min(usableWidth / content.width, usableHeight / content.height, 1));
  return centreIn(area, zoom, content);
}

/* --- Projection ----------------------------------------------------------- */

/**
 * What is needed to convert between frame space and studio space: where the frame's
 * top-left has ended up on screen, and how much it has been scaled by.
 */
export interface Projection {
  originX: number;
  originY: number;
  zoom: number;
}

/**
 * The projection for a canvas iframe's document, or null before it is in the layout.
 *
 * The frame's rect is read afresh on every call rather than cached, because a panel
 * resize, a pan and a zoom all move it without firing anything a cache could listen to.
 */
export function frameProjection(doc: Document, zoom: number): Projection | null {
  const frame = doc.defaultView?.frameElement as HTMLElement | null | undefined;
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  return { originX: rect.left, originY: rect.top, zoom };
}

/** A length measured inside the frame, in studio pixels. */
export function scaleLength(length: number, projection: Projection): number {
  return length * projection.zoom;
}

/** A point measured inside the frame, in studio client coordinates. */
export function toStudioPoint(
  x: number,
  y: number,
  projection: Projection,
): { x: number; y: number } {
  return {
    x: projection.originX + x * projection.zoom,
    y: projection.originY + y * projection.zoom,
  };
}

/** A rect measured inside the frame, in studio client coordinates. */
export function toStudioSpace(
  rect: { left: number; top: number; width: number; height: number },
  projection: Projection,
): Rect {
  const origin = toStudioPoint(rect.left, rect.top, projection);
  return {
    left: origin.x,
    top: origin.y,
    width: scaleLength(rect.width, projection),
    height: scaleLength(rect.height, projection),
  };
}

/**
 * A studio client point in frame space — the inverse of `toStudioPoint`.
 *
 * This is what hit-testing needs: `elementFromPoint` is asked in the frame's own
 * coordinates, which is §5.5.
 */
export function toFrameSpace(
  x: number,
  y: number,
  projection: Projection,
): { x: number; y: number } {
  return {
    x: (x - projection.originX) / projection.zoom,
    y: (y - projection.originY) / projection.zoom,
  };
}
