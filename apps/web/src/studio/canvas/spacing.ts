/**
 * Drag-to-adjust margin and padding on the canvas — the geometry and the arithmetic.
 *
 * Kept apart from the overlay that draws it for the reason `viewport.ts` and `marquee.ts`
 * are: where a band sits, which edges a modifier writes and what a pointer delta does to a
 * length are all decisions that can be wrong in ways a screenshot will not show. Here they
 * are functions over numbers, and the component below is left with the DOM.
 *
 * The model is Webflow's, because it is the one people arrive already knowing: a band just
 * inside the element's edge drags that edge's padding, a band just outside drags its
 * margin. The two never overlap, so there is no modifier to learn and no mode to be in —
 * which side of the border you grab *is* the choice.
 */

import type { Rect } from './viewport.js';

export const EDGES = ['top', 'right', 'bottom', 'left'] as const;
export type Edge = (typeof EDGES)[number];

export type SpacingKind = 'margin' | 'padding';

/** One grabbable band: which of the two boxes, and which of its four edges. */
export interface SpacingHandle {
  kind: SpacingKind;
  edge: Edge;
}

/**
 * How thick a band is, in studio pixels.
 *
 * A constant in *studio* space rather than design space, so the target stays the same size
 * under the hand at every zoom. The alternative — a band that is 10 design pixels — is
 * 2.5px at 25% and unhittable exactly when the whole page is on screen.
 */
export const BAND_PX = 10;

/**
 * How much room an edge needs before its padding band is drawn, as a multiple of the band.
 *
 * Below it the two opposite bands would meet in the middle and the element would be nothing
 * but handles, with no way left to click the thing itself. Margin bands have no such limit:
 * they are outside the element and cannot cover it however small it gets.
 */
const PADDING_BAND_CLEARANCE = 3;

/** The CSS longhand a handle writes — `paddingLeft`, `marginTop`. */
export function spacingProperty(kind: SpacingKind, edge: Edge): string {
  return `${kind}${edge[0]!.toUpperCase()}${edge.slice(1)}`;
}

/** The human name for a handle, for its tooltip and its readout. */
export function spacingLabel(kind: SpacingKind, edge: Edge): string {
  return `${kind === 'margin' ? 'Margin' : 'Padding'} ${edge}`;
}

export function oppositeEdge(edge: Edge): Edge {
  switch (edge) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

/** Left and right bands are dragged sideways; top and bottom, up and down. */
export function edgeAxis(edge: Edge): 'x' | 'y' {
  return edge === 'left' || edge === 'right' ? 'x' : 'y';
}

/**
 * Where a band goes, in the same studio client coordinates the selection outline uses, or
 * null when there is not enough of the element to draw it on.
 *
 * `rect` is the element's border box. Padding bands fall inside it and margin bands just
 * outside, which is what makes the pair unambiguous to grab.
 *
 * The corners belong to the left and right bands, and the top and bottom ones are inset to
 * clear them. Every band is therefore disjoint from every other, so hit-testing does not
 * depend on the order they happen to be painted in — which is the kind of thing that works
 * until someone reorders a list.
 */
export function bandRect(handle: SpacingHandle, rect: Rect): Rect | null {
  const t = BAND_PX;
  const { kind, edge } = handle;

  if (kind === 'padding') {
    // Both bands on an axis have to fit and still leave the element clickable between them.
    const room = edgeAxis(edge) === 'x' ? rect.width : rect.height;
    if (room < t * PADDING_BAND_CLEARANCE) return null;

    switch (edge) {
      case 'left':
        return { left: rect.left, top: rect.top, width: t, height: rect.height };
      case 'right':
        return { left: rect.left + rect.width - t, top: rect.top, width: t, height: rect.height };
      case 'top':
        return { left: rect.left + t, top: rect.top, width: rect.width - t * 2, height: t };
      case 'bottom':
        return {
          left: rect.left + t,
          top: rect.top + rect.height - t,
          width: rect.width - t * 2,
          height: t,
        };
    }
  }

  switch (edge) {
    case 'left':
      return { left: rect.left - t, top: rect.top - t, width: t, height: rect.height + t * 2 };
    case 'right':
      return {
        left: rect.left + rect.width,
        top: rect.top - t,
        width: t,
        height: rect.height + t * 2,
      };
    case 'top':
      return { left: rect.left, top: rect.top - t, width: rect.width, height: t };
    case 'bottom':
      return { left: rect.left, top: rect.top + rect.height, width: rect.width, height: t };
  }
}

/**
 * How far a pointer delta moves *this* edge's value.
 *
 * Every edge grows in the direction that makes the box bigger, which is the only reading
 * under which the band follows the cursor: dragging the right edge rightwards has to add to
 * `paddingRight` even though the pointer's `dx` is positive and the edge is on the far side.
 */
export function edgeDelta(edge: Edge, dx: number, dy: number): number {
  switch (edge) {
    case 'left':
      return dx;
    case 'right':
      return -dx;
    case 'top':
      return dy;
    case 'bottom':
      return -dy;
  }
}

export interface SpacingModifiers {
  /** Alt/Option — mirror to the opposite edge. */
  alt: boolean;
  /** Shift — all four edges at once. */
  shift: boolean;
}

/**
 * Which edges a gesture writes. Webflow's modifiers, for the same reason as its bands.
 */
export function affectedEdges(edge: Edge, modifiers: SpacingModifiers): Edge[] {
  if (modifiers.shift) return [...EDGES];
  if (modifiers.alt) return [edge, oppositeEdge(edge)];
  return [edge];
}

/**
 * How much each edge of a gesture moves: every affected edge by the same amount, measured
 * on the edge that was actually grabbed.
 *
 * The one number is the whole point, and getting it wrong is silent. Asking `edgeDelta` for
 * each edge in turn looks equivalent and is not — `left` and `right` have opposite signs by
 * construction, so Alt-dragging the left padding outwards would *grow* the left and *shrink*
 * the right, sliding the content sideways instead of padding it evenly. What Alt and Shift
 * mean is "this much, here too", so the grabbed edge's delta is the one they carry.
 */
export function edgeDeltas(
  grabbed: Edge,
  dx: number,
  dy: number,
  modifiers: SpacingModifiers,
): Map<Edge, number> {
  const delta = edgeDelta(grabbed, dx, dy);
  return new Map(affectedEdges(grabbed, modifiers).map((edge) => [edge, delta]));
}

/**
 * A CSS length split into its number and its unit, or null for anything that is not a plain
 * length — `auto`, `calc(...)`, `var(--space-4)`, or a multi-value shorthand.
 *
 * Returning null is not a failure: it is how the drag decides to take a property over with a
 * concrete pixel value rather than trying to edit an expression it cannot safely rewrite.
 */
export function parseLength(
  value: string | number | undefined,
): { amount: number; unit: string } | null {
  if (value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? { amount: value, unit: '' } : null;

  const match = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(value.trim());
  if (!match) return null;

  const amount = Number(match[1]);
  return Number.isFinite(amount) ? { amount, unit: (match[2] ?? '').toLowerCase() } : null;
}

/**
 * The pixels one unit is worth, measured rather than assumed.
 *
 * One ratio covers every unit there is. The browser has already resolved the authored value
 * to pixels, so dividing tells us what `rem`, `em`, `%`, `ch` or anything else means *for
 * this element* without a table of conversions that would be wrong for three of them.
 *
 * Null when the ratio cannot be had — an authored zero divides by nothing, and a value the
 * parser rejected has no number to divide. The caller's answer to null is to write px.
 */
export function pxPerUnit(
  authored: { amount: number; unit: string } | null,
  computedPx: number,
): number | null {
  if (!authored || authored.unit === '' || authored.unit === 'px') return 1;
  if (authored.amount === 0 || !Number.isFinite(computedPx)) return null;

  const ratio = computedPx / authored.amount;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/** Four decimals, with the trailing zeros a division leaves behind taken off again. */
function trim(amount: number): number {
  return Number(amount.toFixed(4));
}

export interface NextLengthArgs {
  /** The edge's computed value in design pixels, read once when the drag began. */
  startPx: number;
  /** How far the drag has come on this edge, in design pixels. */
  deltaPx: number;
  /** The unit to write the result back in. Empty means a bare number, which is px. */
  unit: string;
  /** What one of that unit is worth in pixels, or null to give up and write px. */
  pxPerUnit: number | null;
  /** Padding cannot be negative; a negative margin is a legitimate thing to want. */
  allowNegative: boolean;
}

/**
 * The value to write for one edge, ready for `setStyle`.
 *
 * Rounded in *pixel* space and then converted, rather than rounded in the authored unit.
 * Dragging is a judgement about what the page looks like, so the thing that should land on
 * a whole number is the number of pixels on screen — a `rem` that comes out as `1.0625` is
 * the honest description of an edge the user dragged to 17px.
 *
 * Returns a bare `number` for pixels, which is what the inspector's own fields produce and
 * what the serializer turns back into `px` — so a dragged edge and a typed one are the same
 * declaration, and neither can be told apart afterwards.
 */
export function nextLength(args: NextLengthArgs): string | number {
  const raw = args.startPx + args.deltaPx;
  const px = Math.round(args.allowNegative ? raw : Math.max(0, raw));

  const scale = args.pxPerUnit;
  if (args.unit === '' || args.unit === 'px' || scale === null || scale <= 0) return px;

  return `${trim(px / scale)}${args.unit}`;
}
