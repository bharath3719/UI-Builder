import { describe, expect, it } from 'vitest';
import {
  ARTBOARD_SIZE,
  FIT_PADDING_PX,
  ZOOM_MAX,
  ZOOM_MIN,
  centreIn,
  clampZoom,
  fitTo,
  panBy,
  scaleLength,
  steppedZoom,
  toFrameSpace,
  toStudioPoint,
  toStudioSpace,
  zoomAt,
  type Projection,
  type Viewport,
} from './viewport.js';

const VIEW: Viewport = { zoom: 1, x: 100, y: 50 };

/** A frame 40px from the left of the studio, 12 from the top, at half scale. */
const HALF: Projection = { originX: 40, originY: 12, zoom: 0.5 };

describe('clampZoom', () => {
  it('holds the zoom inside its range', () => {
    expect(clampZoom(0.001)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1.25)).toBe(1.25);
  });

  it('falls back to 100% for a value that is not a usable number', () => {
    // Both arrive the same way: a fit computed against an area of zero size.
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('zoomAt', () => {
  it('keeps the point under the anchor where it is', () => {
    const anchor = { x: 300, y: 200 };

    // The artboard point currently under the anchor, before and after.
    const before = { x: (anchor.x - VIEW.x) / VIEW.zoom, y: (anchor.y - VIEW.y) / VIEW.zoom };
    const zoomed = zoomAt(VIEW, 2.5, anchor);
    const after = {
      x: (anchor.x - zoomed.x) / zoomed.zoom,
      y: (anchor.y - zoomed.y) / zoomed.zoom,
    };

    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('clamps, and does nothing at all once clamped', () => {
    const at = zoomAt(VIEW, 500, { x: 10, y: 10 });
    expect(at.zoom).toBe(ZOOM_MAX);

    // Already at the ceiling: the pan must not drift on every further wheel notch.
    expect(zoomAt(at, 500, { x: 10, y: 10 })).toBe(at);
  });
});

describe('panBy', () => {
  it('moves the artboard with the pointer', () => {
    expect(panBy(VIEW, 10, -5)).toEqual({ zoom: 1, x: 110, y: 45 });
  });

  it('returns the same object for a zero move', () => {
    expect(panBy(VIEW, 0, 0)).toBe(VIEW);
  });
});

describe('steppedZoom', () => {
  it('walks to the next stop in each direction', () => {
    expect(steppedZoom(1, 1)).toBe(1.5);
    expect(steppedZoom(1, -1)).toBe(0.75);
  });

  it('steps off a value that is between stops', () => {
    expect(steppedZoom(0.87, 1)).toBe(1);
    expect(steppedZoom(0.87, -1)).toBe(0.75);
  });

  it('stops at the ends of the range', () => {
    expect(steppedZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(steppedZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});

describe('fitTo', () => {
  it('fits to whichever dimension binds, centred in the other', () => {
    // Width binds: (624 - 64) / 1024 = 0.546…, against (768 - 64) / 768 = 0.916…
    const area = { width: 624, height: 768 };
    const view = fitTo(area);

    expect(view.zoom).toBeCloseTo(0.546875, 6);
    expect(view.x).toBeCloseTo(FIT_PADDING_PX, 6);
    expect(view.x * 2 + ARTBOARD_SIZE.width * view.zoom).toBeCloseTo(area.width, 6);

    // Slack in the other direction is split evenly.
    expect(view.y * 2 + ARTBOARD_SIZE.height * view.zoom).toBeCloseTo(area.height, 6);
    expect(view.y).toBeGreaterThan(FIT_PADDING_PX);
  });

  it('fits to the height when that is the tighter dimension', () => {
    const view = fitTo({ width: 1600, height: 468 });

    // (468 - 64) / 768 = 0.526…
    expect(view.zoom).toBeCloseTo(0.5260416666, 6);
    expect(view.y).toBeCloseTo(FIT_PADDING_PX, 6);
  });

  it('does not scale a design up past 100% to fill a big screen', () => {
    const view = fitTo({ width: 3000, height: 2000 });
    expect(view.zoom).toBe(1);
    expect(view.x).toBeCloseTo((3000 - ARTBOARD_SIZE.width) / 2, 6);
  });

  it('survives an area that has not been laid out yet', () => {
    const view = fitTo({ width: 0, height: 0 });
    expect(view.zoom).toBe(ZOOM_MIN);
    expect(Number.isFinite(view.x)).toBe(true);
    expect(Number.isFinite(view.y)).toBe(true);
  });
});

describe('centreIn', () => {
  it('pins to the padding rather than centring when the artboard overflows', () => {
    const view = centreIn({ width: 400, height: 300 }, 2);
    expect(view).toEqual({ zoom: 2, x: FIT_PADDING_PX, y: FIT_PADDING_PX });
  });
});

describe('projection', () => {
  it('scales a frame rect into studio space', () => {
    expect(toStudioSpace({ left: 20, top: 40, width: 200, height: 100 }, HALF)).toEqual({
      left: 50,
      top: 32,
      width: 100,
      height: 50,
    });
  });

  it('round-trips a point through frame space', () => {
    const studio = toStudioPoint(137, 219, HALF);
    const back = toFrameSpace(studio.x, studio.y, HALF);
    expect(back.x).toBeCloseTo(137, 10);
    expect(back.y).toBeCloseTo(219, 10);
  });

  it('leaves everything alone at 100% with the frame at the origin', () => {
    const identity: Projection = { originX: 0, originY: 0, zoom: 1 };
    expect(toStudioPoint(11, 22, identity)).toEqual({ x: 11, y: 22 });
    expect(scaleLength(64, identity)).toBe(64);
  });
});
