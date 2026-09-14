/**
 * Whether a wheel over the canvas belongs to the *design* rather than to the viewport.
 *
 * The canvas answers a wheel by panning (PLAN.md §5.4), which is right over the backdrop
 * and wrong over a page that is taller than the artboard: the thing under the pointer is a
 * document with more of itself below the fold, and scrolling it is how you look at the part
 * you are building. So the frame's wheel handler asks this first and pans only when the
 * answer is no — which is also what makes the design's own scroll areas (`Scroll`, a
 * `overflow: auto` box someone styled) work while editing.
 *
 * Nothing here mentions zoom. A wheel is a direction and a distance in the design's own
 * scrollports, and the scale it is drawn at does not change which of them can move; the
 * conversion §5.3 insists on is for *positions*, and there are none in this file.
 */

/** The overflow values that make an element a scrollport. `overlay` is a legacy alias. */
const SCROLLABLE = new Set(['auto', 'scroll', 'overlay']);

/** How much slack counts as room. Sub-pixel layout leaves a fraction on most pages. */
const EPSILON = 1;

function canScroll(
  element: Element,
  axis: 'x' | 'y',
  delta: number,
  overflow: string,
  isRoot: boolean,
): boolean {
  if (delta === 0) return false;
  // The root scroller's overflow is `visible`, which is not in the set above — the page
  // still scrolls, and `overflow: hidden` on <html> is how an author says it must not.
  if (!(isRoot ? overflow !== 'hidden' : SCROLLABLE.has(overflow))) return false;

  const [position, inner, outer] =
    axis === 'y'
      ? [element.scrollTop, element.clientHeight, element.scrollHeight]
      : [element.scrollLeft, element.clientWidth, element.scrollWidth];

  const limit = outer - inner;
  if (limit <= EPSILON) return false;
  return delta > 0 ? position < limit - EPSILON : position > EPSILON;
}

/**
 * Whether something under the pointer can absorb this wheel.
 *
 * The walk is from the element the event landed on up to the document, which is the
 * browser's own scroll-chaining order — so a list inside a page scrolls until it reaches
 * its end and the page takes over from there, exactly as it will once the page ships.
 *
 * Only the dominant axis is asked about: a trackpad reports a few pixels of drift on the
 * other one, and letting that hand the gesture to a horizontally scrollable row would stop
 * the canvas panning for reasons nobody could see.
 */
export function scrollsWithinFrame(
  doc: Document,
  target: EventTarget | null,
  dx: number,
  dy: number,
): boolean {
  const view = doc.defaultView;
  if (!view) return false;

  const axis: 'x' | 'y' = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  const delta = axis === 'x' ? dx : dy;
  if (delta === 0) return false;

  // Duck-typed rather than `instanceof Element`: this target comes from the canvas iframe,
  // a separate realm whose `Element` is not the studio's — the same reason `nodeIdOf` in
  // `Canvas.tsx` does not use one either.
  let element = target as Element | null;
  if (!element || typeof element.closest !== 'function') return false;

  while (element) {
    const style = view.getComputedStyle(element);
    // `scrollingElement`, not `documentElement || body`: in standards mode the viewport's
    // scroll is recorded on <html> and `body.scrollTop` stays 0 forever. Treating the body
    // as the root scroller therefore reads a position that never moves, which says "there
    // is room below" at the very bottom of the page — and the canvas would never pan again
    // once the design was tall enough to scroll at all.
    const isRoot = element === (doc.scrollingElement ?? doc.documentElement);
    const overflow = axis === 'x' ? style.overflowX : style.overflowY;

    if (canScroll(element, axis, delta, overflow, isRoot)) return true;

    element = element.parentElement;
  }

  return false;
}
