import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isTyping } from '../shortcuts.js';
import { useStudio } from '../state/context.js';
import type { ViewportControl } from '../state/context.js';
import {
  ARTBOARD_SIZE,
  fitTo,
  frameProjection,
  panBy,
  steppedZoom,
  toStudioPoint,
  zoomAt,
  type Size,
  type Viewport,
} from './viewport.js';

/**
 * How quickly a wheel translates into zoom. Exponential rather than additive, so a
 * notch changes the zoom by the same *proportion* at 20% as at 300% — the alternative
 * crawls when zoomed out and jumps when zoomed in.
 */
const WHEEL_ZOOM_FALLOFF = 250;

/** Wheel deltas can arrive in lines or pages; the rest of this file wants pixels. */
function pixelDelta(delta: number, mode: number): number {
  if (mode === WheelEvent.DOM_DELTA_LINE) return delta * 16;
  if (mode === WheelEvent.DOM_DELTA_PAGE) return delta * 400;
  return delta;
}

function frameElementOf(doc: Document | null): HTMLElement | null {
  return (doc?.defaultView?.frameElement as HTMLElement | null | undefined) ?? null;
}

export interface ViewportGestures {
  /** A pan is in progress. */
  panning: boolean;
  /** Space is held: the next press pans rather than selects. */
  panReady: boolean;
  /** Starts a pan from a press at a point in studio client coordinates. */
  beginPan: (clientX: number, clientY: number) => void;
}

/**
 * Pan and zoom for the canvas — PLAN.md §5.4.
 *
 * Split out of `Canvas` because it is a self-contained concern with four inputs
 * (wheel, space-drag, middle-drag, and the toolbar) and one output, and because the
 * canvas already owns selection, hover and the drag surfaces. None of it does its own
 * coordinate arithmetic: every conversion goes through `viewport.ts`.
 */
export function useViewportGestures(
  areaRef: React.RefObject<HTMLElement | null>,
  doc: Document | null,
): ViewportGestures {
  const { viewport, artboardWidth, setViewport, setViewportControl } = useStudio();

  const [panning, setPanning] = useState(false);
  const [panReady, setPanReady] = useState(false);

  // The artboard is no longer a constant — the breakpoint switcher resizes it — so a
  // fit has to be told what it is fitting. Held in a ref as well, because the first
  // fit runs from a ResizeObserver that must not be re-registered on every change.
  const artboard = useMemo<Size>(
    () => ({ width: artboardWidth, height: ARTBOARD_SIZE.height }),
    [artboardWidth],
  );
  const artboardRef = useRef(artboard);
  useLayoutEffect(() => {
    artboardRef.current = artboard;
  }, [artboard]);

  // Wheel events arrive between React commits, so a layout effect keeps this current
  // for the handlers without making them re-register on every zoom step.
  const viewportRef = useRef<Viewport>(viewport);
  useLayoutEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  /** The visible area's rect, which is what every anchor and the fit are relative to. */
  const areaRect = useCallback(() => areaRef.current?.getBoundingClientRect() ?? null, [areaRef]);

  /* --- The commands the toolbar and the keyboard use ------------------------ */

  const control = useMemo<ViewportControl>(() => {
    const centre = () => {
      const rect = areaRect();
      return rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 };
    };

    return {
      zoomTo: (zoom) => setViewport((current) => zoomAt(current, zoom, centre())),
      zoomStep: (direction) =>
        setViewport((current) => zoomAt(current, steppedZoom(current.zoom, direction), centre())),
      fit: () => {
        const rect = areaRect();
        if (rect) setViewport(fitTo(rect, artboardRef.current));
      },
    };
  }, [areaRect, setViewport]);

  useEffect(() => {
    setViewportControl(control);
    return () => setViewportControl(null);
  }, [control, setViewportControl]);

  /* --- The opening view ----------------------------------------------------- */

  // Once, when the area first has a size. A ResizeObserver rather than a mount effect
  // because the panel is laid out by flexbox and measures zero on the first pass; and
  // *only* once, because re-fitting whenever a panel is dragged would undo the zoom the
  // user had chosen.
  const fitted = useRef(false);
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    const observer = new ResizeObserver(() => {
      if (fitted.current) return;
      const rect = area.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      fitted.current = true;
      setViewport(fitTo(rect, artboardRef.current));
    });

    observer.observe(area);
    return () => observer.disconnect();
  }, [areaRef, setViewport]);

  /* --- Wheel ---------------------------------------------------------------- */

  const onWheel = useCallback(
    (event: WheelEvent, cursor: { x: number; y: number }) => {
      const rect = areaRect();
      if (!rect) return;

      // Always: over the area an unhandled wheel scrolls whatever ancestor will take
      // it, and over the frame it scrolls the design out from under the overlays.
      event.preventDefault();

      const anchor = { x: cursor.x - rect.left, y: cursor.y - rect.top };
      const dx = pixelDelta(event.deltaX, event.deltaMode);
      const dy = pixelDelta(event.deltaY, event.deltaMode);

      // A trackpad pinch is reported as a wheel with `ctrlKey` set, which is also the
      // conventional zoom modifier for a mouse — so one branch serves both.
      if (event.ctrlKey || event.metaKey) {
        setViewport((current) =>
          zoomAt(current, current.zoom * Math.exp(-dy / WHEEL_ZOOM_FALLOFF), anchor),
        );
        return;
      }

      setViewport((current) => panBy(current, -dx, -dy));
    },
    [areaRect, setViewport],
  );

  // Not `onWheel` in JSX: React attaches wheel listeners passively, and a passive
  // listener may not call preventDefault — which is the whole job here.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    const handle = (event: Event) => {
      const wheel = event as WheelEvent;
      onWheel(wheel, { x: wheel.clientX, y: wheel.clientY });
    };

    area.addEventListener('wheel', handle, { passive: false });
    return () => area.removeEventListener('wheel', handle);
  }, [areaRef, onWheel]);

  // The frame is a separate realm and gets its own wheel events, in its own
  // coordinates. Same handler, one conversion earlier.
  useEffect(() => {
    if (!doc) return;

    const handle = (event: Event) => {
      const wheel = event as WheelEvent;
      const projection = frameProjection(doc, viewportRef.current.zoom);
      onWheel(
        wheel,
        projection
          ? toStudioPoint(wheel.clientX, wheel.clientY, projection)
          : { x: wheel.clientX, y: wheel.clientY },
      );
    };

    doc.addEventListener('wheel', handle, { passive: false });
    return () => doc.removeEventListener('wheel', handle);
  }, [doc, onWheel]);

  /* --- Space, and the drag it arms ------------------------------------------ */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isTyping(event.target)) return;
      // Space is the page-scroll key everywhere else; here it is a modifier.
      event.preventDefault();
      setPanReady(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setPanReady(false);
    };

    // A key held while the window loses focus never sends its keyup, which would
    // otherwise leave the canvas stuck in pan mode until Space was pressed again.
    const onBlur = () => setPanReady(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const beginPan = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameElementOf(doc);

      // Set on the element rather than through a re-render, because it has to be true
      // before the *next* pointermove: the frame's own client coordinates travel with
      // the pan, so a move it received would report a delta of zero and the canvas
      // would simply refuse to move.
      if (frame) frame.style.pointerEvents = 'none';
      setPanning(true);

      // The gesture is measured from where it started, not summed from move to move.
      // Accumulating deltas makes every event load-bearing — one that is coalesced,
      // dropped or reordered leaves the canvas permanently offset by that much — while
      // an absolute anchor recovers on the very next move.
      let anchor = { view: viewportRef.current, x: clientX, y: clientY };

      const onMove = (event: Event) => {
        const pointer = event as PointerEvent;

        // A zoom during the gesture (ctrl+wheel with the button still down) moves the
        // artboard itself, so the anchor it was measured against no longer means
        // anything. Re-take it and carry on from here.
        if (viewportRef.current.zoom !== anchor.view.zoom) {
          anchor = { view: viewportRef.current, x: pointer.clientX, y: pointer.clientY };
        }

        const x = anchor.view.x + (pointer.clientX - anchor.x);
        const y = anchor.view.y + (pointer.clientY - anchor.y);
        setViewport((current) =>
          current.x === x && current.y === y ? current : { ...current, x, y },
        );
      };

      const stop = () => {
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', stop, true);
        document.removeEventListener('pointercancel', stop, true);
        if (frame) frame.style.pointerEvents = '';
        setPanning(false);
      };

      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', stop, true);
      document.addEventListener('pointercancel', stop, true);
    },
    [doc, setViewport],
  );

  return { panning, panReady, beginPan };
}
