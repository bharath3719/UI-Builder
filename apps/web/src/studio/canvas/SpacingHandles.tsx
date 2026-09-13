/**
 * Drag-to-adjust margin and padding on the canvas.
 *
 * Eight bands around the selected element: four just inside its edges for padding, four
 * just outside for margin. Press one and it follows the cursor, writing the same
 * declaration the inspector's `SpacingBox` writes, into the same cell.
 *
 * The geometry and the arithmetic are in `spacing.ts`. What is left here is the part that
 * needs a DOM — measuring what an edge currently resolves to, and holding a pointer.
 *
 * Three decisions worth knowing about:
 *
 * - **One node only.** The inspector's fields write to the whole selection, and these do
 *   not, because a handle is drawn *on* an element and dragging it must mean that element.
 *   Bands around one box that silently retyped five is the sort of thing that is discovered
 *   two saves later. Multi-select spacing stays in the inspector, where the field says so.
 *
 * - **Every edge is written on every move**, the ones the modifiers do not name being put
 *   back to what they were. That makes the result a function of the delta and the modifiers
 *   as they are *now*, so letting go of Shift takes the other three edges back rather than
 *   leaving them wherever they were when it was released.
 *
 * - **The whole drag is one undo step**, including the pause in the middle where the user
 *   stops to look at it — see `EditOptions.sustained`.
 */

import { useCallback, useState } from 'react';
import { NODE_ID_ATTRIBUTE } from '@ui-builder/runtime';
import { resolveDecl, type NodeId } from '@ui-builder/schema';
import { useStudio } from '../state/context.js';
import {
  bandRect,
  edgeAxis,
  edgeDeltas,
  EDGES,
  nextLength,
  parseLength,
  pxPerUnit,
  spacingLabel,
  spacingProperty,
  type Edge,
  type SpacingHandle,
  type SpacingKind,
} from './spacing.js';
import { frameProjection, unscaleLength, type Rect } from './viewport.js';
import styles from './SpacingHandles.module.css';

const KINDS: readonly SpacingKind[] = ['padding', 'margin'];

/** What one edge was before the drag began, and what it takes to keep writing it. */
interface EdgeStart {
  /** The resolved value in design pixels — what the browser is actually laying out. */
  startPx: number;
  /** The unit it was authored in, to write the result back in the same one. */
  unit: string;
  /** What one of that unit is worth here, or null to fall back to pixels. */
  pxPerUnit: number | null;
  /**
   * The declaration in *this cell*, which is the thing a write replaces and therefore the
   * thing Escape has to put back. `undefined` means the cell said nothing, and restoring it
   * is a delete rather than a write of zero.
   */
  original: string | number | undefined;
}

type EdgeStarts = Record<Edge, EdgeStart>;

export interface SpacingHandlesProps {
  nodeId: NodeId;
  /** The element's border box, in studio client coordinates — the selection outline's rect. */
  rect: Rect;
  /** The canvas frame's document, where the element is measured. */
  doc: Document;
}

export function SpacingHandles({ nodeId, rect, doc }: SpacingHandlesProps) {
  const { page, theme, cell, viewport, setStyle } = useStudio();
  const node = page.nodes[nodeId];

  /**
   * The drag in progress, or null. One piece of state rather than a ref beside it: which
   * band is lit and what the readout says are the same fact, and a ref could not be read
   * during render to answer the first half of it anyway.
   */
  const [readout, setReadout] = useState<{ handle: SpacingHandle; text: string } | null>(null);

  /**
   * What each of a kind's four edges resolves to right now.
   *
   * All four, not just the one grabbed, because Alt and Shift widen the gesture *during* it
   * — by which time the element has already moved and the values it started at are gone.
   */
  const readStarts = useCallback(
    (kind: SpacingKind): EdgeStarts | null => {
      const view = doc.defaultView;
      const element = doc.querySelector<HTMLElement>(
        `[${NODE_ID_ATTRIBUTE}="${CSS.escape(nodeId)}"]`,
      );
      if (!view || !element || !node) return null;

      const computed = view.getComputedStyle(element);
      const starts = {} as EdgeStarts;

      for (const edge of EDGES) {
        const property = spacingProperty(kind, edge);
        const computedPx = Number.parseFloat(computed.getPropertyValue(`${kind}-${edge}`));

        // The longhand first, then the shorthand it is one quarter of — component defaults
        // are written as `padding: 16`, and `SpacingBox` falls back the same way. A
        // shorthand with several values parses to null and the drag writes px, which is
        // right: there is no one unit `8px 16px` is in.
        const authored =
          parseLength(resolveDecl(node, theme, cell, property).value) ??
          parseLength(resolveDecl(node, theme, cell, kind).value);

        starts[edge] = {
          startPx: Number.isFinite(computedPx) ? computedPx : 0,
          unit: authored?.unit ?? '',
          pxPerUnit: pxPerUnit(authored, computedPx),
          original: node.styles[cell.breakpoint]?.[cell.state]?.[property],
        };
      }

      return starts;
    },
    [cell, doc, node, nodeId, theme],
  );

  const begin = useCallback(
    (handle: SpacingHandle, event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      // The press belongs to the handle and to nothing else: not to the canvas backdrop
      // behind it, which would start a pan, and not to the frame, which cannot see it anyway.
      event.preventDefault();
      event.stopPropagation();

      const measured = frameProjection(doc, viewport.zoom);
      const starts = readStarts(handle.kind);
      if (!measured || !starts) return;
      // Re-bound after the guard: the move handler below is a hoisted declaration, and a
      // narrowing does not survive into one.
      const projection = measured;

      const band = event.currentTarget;
      const origin = { x: event.clientX, y: event.clientY };
      // Padding cannot be negative. A margin can, and pulling one is a real technique.
      const allowNegative = handle.kind === 'margin';
      let done = false;

      // Lit from the press, not from the first move: a band that only acknowledges the
      // grab once the pointer has travelled reads as a click that missed.
      const startValue = starts[handle.edge];
      setReadout({
        handle,
        text: formatReadout(
          startValue.unit === '' || startValue.unit === 'px' || startValue.pxPerUnit === null
            ? Math.round(startValue.startPx)
            : `${Number((startValue.startPx / startValue.pxPerUnit).toFixed(4))}${startValue.unit}`,
        ),
      });

      /** Writes all four edges for the modifiers as they stand. */
      const apply = (dx: number, dy: number, modifiers: { alt: boolean; shift: boolean }) => {
        // One delta for the whole gesture, measured on the edge under the hand — see
        // `edgeDeltas` for why asking each edge separately is not the same thing.
        const deltas = edgeDeltas(handle.edge, dx, dy, modifiers);
        const decls: Record<string, string | number | undefined> = {};
        let shown = '';

        for (const edge of EDGES) {
          const start = starts[edge];
          const property = spacingProperty(handle.kind, edge);
          const deltaPx = deltas.get(edge);

          if (deltaPx === undefined) {
            decls[property] = start.original;
            continue;
          }

          // The delta is taken against where the *pointer* started, never against the
          // element's current rect: the rect is moving because of this very write, and
          // measuring it again each frame is a feedback loop that runs away.
          const value = nextLength({
            startPx: start.startPx,
            deltaPx,
            unit: start.unit,
            pxPerUnit: start.pxPerUnit,
            allowNegative,
          });

          decls[property] = value;
          if (edge === handle.edge) shown = formatReadout(value);
        }

        setStyle(decls, { sustained: true });
        setReadout({ handle, text: shown });
      };

      const finish = (commit: boolean) => {
        if (done) return;
        done = true;

        band.removeEventListener('pointermove', onMove);
        band.removeEventListener('pointerup', onUp);
        band.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKeyDown, true);
        if (band.hasPointerCapture(event.pointerId)) band.releasePointerCapture(event.pointerId);

        if (!commit) {
          // Every edge back to the declaration this cell held before the drag. Still
          // `sustained`, so it lands on the same step and undo is not left with a
          // cancelled gesture to walk back through.
          const decls: Record<string, string | number | undefined> = {};
          for (const edge of EDGES) {
            decls[spacingProperty(handle.kind, edge)] = starts[edge].original;
          }
          setStyle(decls, { sustained: true });
        }

        setReadout(null);
      };

      function onMove(moveEvent: PointerEvent) {
        // Design pixels, not screen ones — the number being edited is the design's.
        const dx = unscaleLength(moveEvent.clientX - origin.x, projection);
        const dy = unscaleLength(moveEvent.clientY - origin.y, projection);
        // Read off the move rather than the press, so Alt and Shift take effect the
        // moment they are held rather than only when the gesture is started with them.
        apply(dx, dy, { alt: moveEvent.altKey, shift: moveEvent.shiftKey });
      }
      function onUp() {
        finish(true);
      }
      function onCancel() {
        finish(false);
      }
      function onKeyDown(keyEvent: KeyboardEvent) {
        if (keyEvent.key === 'Escape') {
          keyEvent.preventDefault();
          keyEvent.stopPropagation();
          finish(false);
        }
      }

      // Capture keeps the gesture on this band once the cursor has left it, which it does
      // immediately — the band is ten pixels wide and the drag is about going further.
      band.setPointerCapture(event.pointerId);
      band.addEventListener('pointermove', onMove);
      band.addEventListener('pointerup', onUp);
      band.addEventListener('pointercancel', onCancel);
      // On the window in the capture phase, ahead of the studio's own Escape binding: mid
      // drag, Escape means "not this drag" rather than "clear the selection".
      window.addEventListener('keydown', onKeyDown, true);
    },
    [doc, readStarts, setStyle, viewport.zoom],
  );

  if (!node) return null;

  const dragging = readout;
  // The root fills the artboard and is laid out by nothing, so a margin on it has no
  // neighbour to push against and no edge to show for it. Its padding is the page's
  // gutter and is worth dragging.
  const kinds = node.parentId === null ? (['padding'] as const) : KINDS;

  return (
    <>
      {kinds.flatMap((kind) =>
        EDGES.map((edge) => {
          const band = bandRect({ kind, edge }, rect);
          if (!band) return null;

          const active = dragging?.handle.kind === kind && dragging.handle.edge === edge;

          return (
            <div
              key={`${kind}-${edge}`}
              className={[
                styles.band,
                kind === 'padding' ? styles.padding : styles.margin,
                active ? styles.active : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                left: band.left,
                top: band.top,
                width: band.width,
                height: band.height,
                cursor: edgeAxis(edge) === 'x' ? 'ew-resize' : 'ns-resize',
              }}
              title={`${spacingLabel(kind, edge)} — drag to adjust, Alt for both sides, Shift for all four`}
              onPointerDown={(event) => begin({ kind, edge }, event)}
            />
          );
        }),
      )}

      {readout ? (
        <div
          className={styles.readout}
          style={readoutPosition(readout.handle, rect)}
          aria-live="polite"
        >
          {spacingLabel(readout.handle.kind, readout.handle.edge)} {readout.text}
        </div>
      ) : null}
    </>
  );
}

/**
 * A written value as the readout shows it. A bare number is pixels — the same reading
 * `parseDeclValue` and the serializer give it — so the badge says `px` rather than leaving
 * the number to be guessed at.
 */
function formatReadout(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * The readout sits centred on the edge being dragged and just outside the element, where it
 * is out of the way of the spacing it is describing.
 */
function readoutPosition(handle: SpacingHandle, rect: Rect): React.CSSProperties {
  const gap = 24;

  switch (handle.edge) {
    case 'left':
      return {
        left: rect.left - gap,
        top: rect.top + rect.height / 2,
        transform: 'translate(-100%, -50%)',
      };
    case 'right':
      return {
        left: rect.left + rect.width + gap,
        top: rect.top + rect.height / 2,
        transform: 'translateY(-50%)',
      };
    case 'top':
      return {
        left: rect.left + rect.width / 2,
        top: rect.top - gap,
        transform: 'translate(-50%, -100%)',
      };
    case 'bottom':
      return {
        left: rect.left + rect.width / 2,
        top: rect.top + rect.height + gap,
        transform: 'translateX(-50%)',
      };
  }
}
