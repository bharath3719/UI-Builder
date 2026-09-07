import { useCallback, useEffect, useRef, useState } from 'react';

/** Which way the pointer travels to make the panel bigger. */
export type GrowDirection = 'right' | 'left' | 'down' | 'up';

export interface PanelResizeOptions {
  /** localStorage key. Panel sizes are a per-machine preference, not project data. */
  storageKey: string;
  initial: number;
  min: number;
  max: number;
  grow: GrowDirection;
}

/** Keyboard nudge per arrow press. Shift multiplies it — see `onKeyDown`. */
const STEP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function read(key: string, fallback: number, min: number, max: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;

    const parsed = Number.parseFloat(stored);
    // A stored size from an older layout could be outside today's bounds; clamping
    // beats trusting it and beats discarding a preference that is merely stale.
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Drives one resizable panel edge.
 *
 * The drag uses pointer capture rather than window listeners: the handle keeps
 * receiving events even when the pointer outruns it or leaves the window, which is the
 * usual way a hand-rolled splitter ends up stuck mid-drag. It also means no global
 * state to clean up if the component unmounts mid-gesture.
 */
export function usePanelResize({ storageKey, initial, min, max, grow }: PanelResizeOptions) {
  const [size, setSize] = useState(() => read(storageKey, initial, min, max));
  const [dragging, setDragging] = useState(false);

  // A gesture needs the size it started from without the handlers being rebuilt on
  // every pixel of movement. Synced in an effect rather than during render, so this
  // always holds a committed value — which is all a handler can observe anyway.
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  const persist = useCallback(
    (value: number) => {
      try {
        localStorage.setItem(storageKey, String(Math.round(value)));
      } catch {
        // Losing a panel width is not worth failing over.
      }
    },
    [storageKey],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Only the primary button, and never a nested control's own gesture.
      if (event.button !== 0) return;
      event.preventDefault();

      const handle = event.currentTarget;
      const startX = event.clientX;
      const startY = event.clientY;
      const startSize = sizeRef.current;

      handle.setPointerCapture(event.pointerId);
      setDragging(true);

      const measure = (moveEvent: PointerEvent): number => {
        switch (grow) {
          case 'right':
            return moveEvent.clientX - startX;
          case 'left':
            return startX - moveEvent.clientX;
          case 'down':
            return moveEvent.clientY - startY;
          case 'up':
            return startY - moveEvent.clientY;
        }
      };

      // Tracked per gesture rather than read back from the ref on release: the last
      // move's state update may not have committed yet when the pointer comes up.
      let latest = startSize;

      const onMove = (moveEvent: PointerEvent) => {
        latest = clamp(startSize + measure(moveEvent), min, max);
        setSize(latest);
      };

      const onEnd = () => {
        handle.releasePointerCapture(event.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onEnd);
        handle.removeEventListener('pointercancel', onEnd);
        setDragging(false);
        persist(latest);
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onEnd);
      handle.addEventListener('pointercancel', onEnd);
    },
    [grow, min, max, persist],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const horizontal = grow === 'left' || grow === 'right';
      const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
      const increase = horizontal ? 'ArrowRight' : 'ArrowDown';

      if (event.key !== decrease && event.key !== increase) return;
      event.preventDefault();

      const towardsEnd = event.key === increase;
      const growsTowardsEnd = grow === 'right' || grow === 'down';
      const step = (event.shiftKey ? STEP * 4 : STEP) * (towardsEnd === growsTowardsEnd ? 1 : -1);

      const next = clamp(sizeRef.current + step, min, max);
      setSize(next);
      persist(next);
    },
    [grow, min, max, persist],
  );

  const separatorProps = {
    role: 'separator' as const,
    'aria-orientation': (grow === 'left' || grow === 'right' ? 'vertical' : 'horizontal') as
      'vertical' | 'horizontal',
    'aria-valuenow': Math.round(size),
    'aria-valuemin': min,
    'aria-valuemax': max,
    tabIndex: 0,
    onPointerDown,
    onKeyDown,
  };

  return { size, dragging, separatorProps };
}
