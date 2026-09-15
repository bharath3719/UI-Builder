import { describe, expect, it } from 'vitest';
import {
  affectedEdges,
  bandRect,
  BAND_PX,
  edgeAxis,
  edgeDelta,
  edgeDeltas,
  EDGES,
  nextLength,
  oppositeEdge,
  parseLength,
  pxPerUnit,
  spacingLabel,
  spacingProperty,
  type SpacingHandle,
} from './spacing.js';
import type { Rect } from './viewport.js';

/** A box with room to spare, so no band is suppressed for want of space. */
const BOX: Rect = { left: 100, top: 200, width: 300, height: 120 };

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

describe('spacingProperty', () => {
  it('names the CSS longhand the inspector uses', () => {
    expect(spacingProperty('padding', 'left')).toBe('paddingLeft');
    expect(spacingProperty('margin', 'top')).toBe('marginTop');
    expect(spacingProperty('padding', 'bottom')).toBe('paddingBottom');
  });

  it('agrees with SpacingBox for every edge', () => {
    // The two panels must write the same property or a dragged edge and a typed one
    // become separate declarations that fight each other in the cascade.
    for (const edge of EDGES) {
      const capitalised = edge[0]!.toUpperCase() + edge.slice(1);
      expect(spacingProperty('margin', edge)).toBe(`margin${capitalised}`);
    }
  });
});

describe('oppositeEdge', () => {
  it('pairs the edges', () => {
    expect(oppositeEdge('top')).toBe('bottom');
    expect(oppositeEdge('bottom')).toBe('top');
    expect(oppositeEdge('left')).toBe('right');
    expect(oppositeEdge('right')).toBe('left');
  });

  it('is its own inverse', () => {
    for (const edge of EDGES) expect(oppositeEdge(oppositeEdge(edge))).toBe(edge);
  });
});

describe('bandRect', () => {
  it('puts padding bands inside the border box', () => {
    const left = bandRect({ kind: 'padding', edge: 'left' }, BOX);
    expect(left).toEqual({ left: 100, top: 200, width: BAND_PX, height: 120 });

    const right = bandRect({ kind: 'padding', edge: 'right' }, BOX)!;
    expect(right.left).toBe(100 + 300 - BAND_PX);
    // Flush with the element's right edge, which is what "inside" means.
    expect(right.left + right.width).toBe(400);
  });

  it('puts margin bands outside it', () => {
    const left = bandRect({ kind: 'margin', edge: 'left' }, BOX)!;
    expect(left.left).toBe(100 - BAND_PX);
    // Ends exactly where the element begins: outside, and touching.
    expect(left.left + left.width).toBe(100);

    const bottom = bandRect({ kind: 'margin', edge: 'bottom' }, BOX)!;
    expect(bottom.top).toBe(200 + 120);
  });

  it('never overlaps a padding band with its own margin band', () => {
    for (const edge of EDGES) {
      const inner = bandRect({ kind: 'padding', edge }, BOX)!;
      const outer = bandRect({ kind: 'margin', edge }, BOX)!;
      expect(overlaps(inner, outer)).toBe(false);
    }
  });

  it('keeps every band of a kind disjoint, so hit-testing does not depend on paint order', () => {
    for (const kind of ['padding', 'margin'] as const) {
      const rects = EDGES.map((edge) => bandRect({ kind, edge }, BOX)!);
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
        }
      }
    }
  });

  it('gives the corners to the left and right bands', () => {
    const top = bandRect({ kind: 'padding', edge: 'top' }, BOX)!;
    expect(top.left).toBe(100 + BAND_PX);
    expect(top.width).toBe(300 - BAND_PX * 2);
  });

  it('suppresses a padding band when the element is too small to keep any of itself', () => {
    const thin: Rect = { left: 0, top: 0, width: BAND_PX * 3 - 1, height: 500 };
    expect(bandRect({ kind: 'padding', edge: 'left' }, thin)).toBeNull();
    expect(bandRect({ kind: 'padding', edge: 'right' }, thin)).toBeNull();
    // The other axis has room, and is unaffected.
    expect(bandRect({ kind: 'padding', edge: 'top' }, thin)).not.toBeNull();
  });

  it('draws margin bands however small the element is', () => {
    const tiny: Rect = { left: 0, top: 0, width: 2, height: 2 };
    for (const edge of EDGES) {
      expect(bandRect({ kind: 'margin', edge }, tiny)).not.toBeNull();
    }
  });
});

describe('edgeDelta', () => {
  it('grows every edge in the direction that enlarges the box', () => {
    expect(edgeDelta('left', 10, 0)).toBe(10);
    expect(edgeDelta('right', 10, 0)).toBe(-10);
    expect(edgeDelta('top', 0, 10)).toBe(10);
    expect(edgeDelta('bottom', 0, 10)).toBe(-10);
  });

  it('ignores the axis it does not live on', () => {
    expect(edgeDelta('left', 0, 99)).toBe(0);
    expect(edgeDelta('top', 99, 0)).toBe(0);
  });

  it('makes an outward drag positive on both sides of an axis', () => {
    // Dragging the left band leftwards and the right band rightwards are both
    // "make it wider", which is the whole reason the signs differ.
    expect(edgeDelta('left', -8, 0)).toBeLessThan(0);
    expect(edgeDelta('right', 8, 0)).toBeLessThan(0);
  });
});

describe('edgeAxis', () => {
  it('splits the edges by the direction they are dragged', () => {
    expect(edgeAxis('left')).toBe('x');
    expect(edgeAxis('right')).toBe('x');
    expect(edgeAxis('top')).toBe('y');
    expect(edgeAxis('bottom')).toBe('y');
  });
});

describe('affectedEdges', () => {
  const plain = { alt: false, shift: false };

  it('writes one edge with no modifier', () => {
    expect(affectedEdges('left', plain)).toEqual(['left']);
  });

  it('mirrors to the opposite edge with Alt', () => {
    expect(affectedEdges('left', { alt: true, shift: false })).toEqual(['left', 'right']);
    expect(affectedEdges('top', { alt: true, shift: false })).toEqual(['top', 'bottom']);
  });

  it('writes all four with Shift', () => {
    expect(affectedEdges('left', { alt: false, shift: true })).toEqual([...EDGES]);
  });

  it('lets Shift win over Alt rather than compounding them', () => {
    expect(affectedEdges('left', { alt: true, shift: true })).toEqual([...EDGES]);
  });

  it('always includes the edge that was grabbed', () => {
    for (const edge of EDGES) {
      for (const alt of [true, false]) {
        for (const shift of [true, false]) {
          expect(affectedEdges(edge, { alt, shift })).toContain(edge);
        }
      }
    }
  });
});

describe('edgeDeltas', () => {
  const plain = { alt: false, shift: false };

  it('moves the grabbed edge by its own delta', () => {
    expect([...edgeDeltas('left', 30, 0, plain)]).toEqual([['left', 30]]);
    expect([...edgeDeltas('right', 30, 0, plain)]).toEqual([['right', -30]]);
  });

  it('gives the mirrored edge the SAME delta, not the opposite one', () => {
    // The bug this exists to prevent: asking `edgeDelta` per edge gives `right` the
    // opposite sign, so Alt-dragging the left padding outwards grew the left and shrank
    // the right — sliding the content sideways instead of padding it evenly.
    const deltas = edgeDeltas('left', 30, 0, { alt: true, shift: false });
    expect(deltas.get('left')).toBe(30);
    expect(deltas.get('right')).toBe(30);
  });

  it('gives all four the same delta under Shift', () => {
    const deltas = edgeDeltas('top', 0, 12, { alt: false, shift: true });
    expect([...deltas.values()]).toEqual([12, 12, 12, 12]);
    expect([...deltas.keys()].sort()).toEqual([...EDGES].sort());
  });

  it('carries the grabbed edge’s sign outward on every axis', () => {
    // Dragging the *right* band rightwards is "make it wider", and under Alt that has to
    // widen both sides — so both deltas are negative together, never one of each.
    const deltas = edgeDeltas('right', -30, 0, { alt: true, shift: false });
    expect(deltas.get('right')).toBe(30);
    expect(deltas.get('left')).toBe(30);

    const vertical = edgeDeltas('bottom', 0, -8, { alt: true, shift: false });
    expect(vertical.get('bottom')).toBe(8);
    expect(vertical.get('top')).toBe(8);
  });

  it('names exactly the edges affectedEdges names', () => {
    for (const edge of EDGES) {
      for (const alt of [true, false]) {
        for (const shift of [true, false]) {
          const modifiers = { alt, shift };
          expect([...edgeDeltas(edge, 5, 5, modifiers).keys()]).toEqual(
            affectedEdges(edge, modifiers),
          );
        }
      }
    }
  });
});

describe('parseLength', () => {
  it('reads a bare number as unitless', () => {
    expect(parseLength(16)).toEqual({ amount: 16, unit: '' });
  });

  it('reads a number with a unit', () => {
    expect(parseLength('1.5rem')).toEqual({ amount: 1.5, unit: 'rem' });
    expect(parseLength('12px')).toEqual({ amount: 12, unit: 'px' });
    expect(parseLength('50%')).toEqual({ amount: 50, unit: '%' });
  });

  it('reads a negative length', () => {
    expect(parseLength('-4px')).toEqual({ amount: -4, unit: 'px' });
  });

  it('lowercases the unit so the comparison downstream is safe', () => {
    expect(parseLength('2REM')?.unit).toBe('rem');
  });

  it('tolerates surrounding space', () => {
    expect(parseLength('  8px ')).toEqual({ amount: 8, unit: 'px' });
  });

  it('refuses what it cannot safely rewrite', () => {
    expect(parseLength('auto')).toBeNull();
    expect(parseLength('calc(100% - 4px)')).toBeNull();
    expect(parseLength('var(--space-4)')).toBeNull();
    expect(parseLength('8px 16px')).toBeNull();
    expect(parseLength(undefined)).toBeNull();
    expect(parseLength('')).toBeNull();
  });
});

describe('pxPerUnit', () => {
  it('is 1 for pixels and for a bare number', () => {
    expect(pxPerUnit({ amount: 16, unit: '' }, 16)).toBe(1);
    expect(pxPerUnit({ amount: 16, unit: 'px' }, 16)).toBe(1);
    expect(pxPerUnit(null, 16)).toBe(1);
  });

  it('measures the ratio for any other unit', () => {
    expect(pxPerUnit({ amount: 1.5, unit: 'rem' }, 24)).toBe(16);
    expect(pxPerUnit({ amount: 50, unit: '%' }, 200)).toBe(4);
  });

  it('gives up on an authored zero, which divides by nothing', () => {
    expect(pxPerUnit({ amount: 0, unit: 'rem' }, 0)).toBeNull();
  });

  it('gives up rather than returning a nonsense ratio', () => {
    expect(pxPerUnit({ amount: 2, unit: 'rem' }, Number.NaN)).toBeNull();
    expect(pxPerUnit({ amount: -2, unit: 'rem' }, 32)).toBeNull();
  });
});

describe('nextLength', () => {
  const base = { unit: '', pxPerUnit: 1, allowNegative: false };

  it('adds the delta to where the drag started', () => {
    expect(nextLength({ ...base, startPx: 10, deltaPx: 6 })).toBe(16);
  });

  it('rounds to whole pixels', () => {
    expect(nextLength({ ...base, startPx: 10, deltaPx: 6.4 })).toBe(16);
    expect(nextLength({ ...base, startPx: 10, deltaPx: 6.6 })).toBe(17);
  });

  it('returns a number for pixels, so a dragged edge matches a typed one', () => {
    expect(typeof nextLength({ ...base, startPx: 0, deltaPx: 8 })).toBe('number');
  });

  it('clamps padding at zero', () => {
    expect(nextLength({ ...base, startPx: 4, deltaPx: -40 })).toBe(0);
  });

  it('lets a margin go negative', () => {
    expect(nextLength({ ...base, startPx: 4, deltaPx: -40, allowNegative: true })).toBe(-36);
  });

  it('writes the result back in the unit it was authored in', () => {
    // 16px + 16px = 32px, which at 16px per rem is 2rem.
    expect(
      nextLength({ startPx: 16, deltaPx: 16, unit: 'rem', pxPerUnit: 16, allowNegative: false }),
    ).toBe('2rem');
  });

  it('rounds in pixel space, not in the authored unit', () => {
    // 16px + 1px = 17px is a whole pixel, and 1.0625rem is what that is.
    expect(
      nextLength({ startPx: 16, deltaPx: 1, unit: 'rem', pxPerUnit: 16, allowNegative: false }),
    ).toBe('1.0625rem');
  });

  it('trims the trailing zeros a division leaves behind', () => {
    expect(
      nextLength({ startPx: 0, deltaPx: 32, unit: 'rem', pxPerUnit: 16, allowNegative: false }),
    ).toBe('2rem');
  });

  it('falls back to pixels when the unit could not be measured', () => {
    expect(
      nextLength({ startPx: 8, deltaPx: 8, unit: 'rem', pxPerUnit: null, allowNegative: false }),
    ).toBe(16);
    expect(
      nextLength({ startPx: 8, deltaPx: 8, unit: '%', pxPerUnit: 0, allowNegative: false }),
    ).toBe(16);
  });
});

describe('spacingLabel', () => {
  it('names the handle for its tooltip and readout', () => {
    expect(spacingLabel('padding', 'left')).toBe('Padding left');
    expect(spacingLabel('margin', 'bottom')).toBe('Margin bottom');
  });
});

describe('the handle set', () => {
  it('covers both boxes on all four edges and nothing twice', () => {
    const all: SpacingHandle[] = (['padding', 'margin'] as const).flatMap((kind) =>
      EDGES.map((edge) => ({ kind, edge })),
    );
    expect(all).toHaveLength(8);
    expect(new Set(all.map((h) => spacingProperty(h.kind, h.edge))).size).toBe(8);
  });
});
