import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NODE_ID_ATTRIBUTE, PageRenderer } from '@ui-builder/runtime';
import { isLocked, symbolDefaultProps, type Node, type NodeId } from '@ui-builder/schema';
import { useStudio } from '../state/context.js';
import {
  beginDragSession,
  frameSurface,
  studioSurface,
  type DragSurface,
} from '../dnd/dragSession.js';
import { canDrag } from '../dnd/rules.js';
import { CanvasFrame } from './CanvasFrame.js';
import { isMarquee, marqueeRect, nodesInMarquee } from './marquee.js';
import { dragLabel, resolveDrop } from './resolveDrop.js';
import { useViewportGestures } from './useViewportGestures.js';
import {
  ARTBOARD_SIZE,
  frameProjection,
  sceneTransform,
  toStudioPoint,
  toStudioSpace,
  type Projection,
  type Rect,
} from './viewport.js';
import styles from './Canvas.module.css';

/**
 * How far the pointer may travel during a backdrop press and still count as a click
 * rather than a pan. A press that never moves is rare — a hand on a trackpad drifts a
 * pixel or two — and clearing the selection is not worth losing to that drift.
 */
const CLICK_SLOP = 4;

/**
 * The node an event happened inside, or null.
 *
 * Deliberately duck-typed rather than `target instanceof Element`: these events come
 * from the canvas iframe, which is a separate realm with its own `Element`
 * constructor, so an `instanceof` check against the studio's would be false for every
 * element on the canvas — silently disabling selection and hover entirely.
 */
function nodeIdOf(target: EventTarget | null): NodeId | null {
  const element = target as Element | null;
  if (!element || typeof element.closest !== 'function') return null;
  return element.closest(`[${NODE_ID_ATTRIBUTE}]`)?.getAttribute(NODE_ID_ATTRIBUTE) ?? null;
}

/** An element's rect inside the frame, translated into studio client coordinates. */
function measure(doc: Document, id: NodeId, projection: Projection): Rect | null {
  const element = doc.querySelector<HTMLElement>(`[${NODE_ID_ATTRIBUTE}="${CSS.escape(id)}"]`);
  if (!element) return null;
  return toStudioSpace(element.getBoundingClientRect(), projection);
}

/** One selected node and where its outline goes. */
interface PlacedRect {
  id: NodeId;
  rect: Rect;
}

const NO_RECTS: readonly PlacedRect[] = Object.freeze([]);

/**
 * Ctrl/⌘ and Shift both mean "as well as what is already selected".
 *
 * They are one thing here and two in the layers tree, because a tree has an order and
 * a canvas does not: Shift-clicking between two rows is a meaningful range, while
 * Shift-clicking between two boxes on a page is not a request anyone could answer.
 */
function isAdditive(event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey;
}

/**
 * The canvas — the artboard, the design inside it, and the editor chrome on top.
 *
 * The chrome is drawn in the studio's document rather than inside the frame, so that
 * selection outlines are never affected by the user's own CSS and never end up in the
 * exported page. That means every overlay position is a measurement, which is why
 * they are recomputed on any change that could move an element.
 */
export function Canvas() {
  const studio = useStudio();
  const {
    page,
    symbol,
    symbols,
    theme,
    selectedId,
    selectedIds,
    hoveredId,
    drag,
    viewport,
    cell,
    artboardWidth,
    select,
    hover,
  } = studio;

  const symbolProps = useMemo(() => (symbol ? symbolDefaultProps(symbol) : undefined), [symbol]);

  const [doc, setDoc] = useState<Document | null>(null);
  const [selectionRects, setSelectionRects] = useState<readonly PlacedRect[]>(NO_RECTS);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [band, setBand] = useState<Rect | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const { panning, panReady, beginPan } = useViewportGestures(areaRef, doc);

  // The drop resolver and the drag session both need the studio as it is *now*, and
  // neither should be torn down and rebuilt on every keystroke in the inspector. The
  // ref is written after commit rather than during render; every reader of it is an
  // event handler, which cannot run before the effect has caught up.
  const stateRef = useRef(studio);
  useEffect(() => {
    stateRef.current = studio;
  });

  const onDocument = useCallback((next: Document | null) => setDoc(next), []);

  /* --- Drop resolution ---------------------------------------------------- */

  useEffect(() => {
    if (!doc) {
      studio.setDropResolver('canvas', null);
      return;
    }

    studio.setDropResolver('canvas', (x, y, source) => {
      const projection = frameProjection(doc, stateRef.current.viewport.zoom);
      if (!projection) return null;
      return resolveDrop({ doc, page: stateRef.current.page, projection, x, y, source });
    });

    return () => studio.setDropResolver('canvas', null);
  }, [doc, studio]);

  /* --- Overlay measurement ------------------------------------------------- */

  const remeasure = useCallback(() => {
    // Rebuilt on every pass rather than kept: pan and zoom move the frame without
    // firing anything, so the only safe moment to read it is just before it is used.
    const projection = doc ? frameProjection(doc, viewport.zoom) : null;

    const next: PlacedRect[] = [];
    if (doc && projection) {
      for (const id of selectedIds) {
        const rect = measure(doc, id, projection);
        // A selected node with no element is one the design does not currently render
        // — hidden, or inside something hidden. It keeps its place in the selection
        // and simply has no outline to draw.
        if (rect) next.push({ id, rect });
      }
    }

    const nextHover =
      doc && projection && hoveredId && !selectedIds.includes(hoveredId)
        ? measure(doc, hoveredId, projection)
        : null;

    // Only commit an actual change. Scroll and resize fire far more often than the
    // overlays move, and a new object every time would re-render the whole canvas at
    // pointer frequency.
    setSelectionRects((current) => (samePlacedRects(current, next) ? current : next));
    setHoverRect((current) => (sameRect(current, nextHover) ? current : nextHover));
  }, [doc, selectedIds, hoveredId, viewport]);

  // Measuring the DOM after it has been laid out, then reflecting the measurement
  // into state, is what a layout effect is for — there is no way to know where an
  // element ended up without looking.
  useLayoutEffect(remeasure, [remeasure, page]);

  useEffect(() => {
    if (!doc) return;
    const view = doc.defaultView;
    if (!view) return;

    // Anything that reflows the design moves the outlines with it: a font finishing
    // loading, an image arriving, the window or a panel resizing, the frame scrolling.
    const observer = new view.ResizeObserver(remeasure);
    observer.observe(doc.documentElement);

    view.addEventListener('scroll', remeasure, true);
    window.addEventListener('resize', remeasure);

    return () => {
      observer.disconnect();
      view.removeEventListener('scroll', remeasure, true);
      window.removeEventListener('resize', remeasure);
    };
  }, [doc, remeasure]);

  /* --- The marquee ---------------------------------------------------------- */

  /**
   * Starts a band that may or may not become one, on the same click-or-drag deferral
   * the drag session uses: below the threshold the gesture was a click, and `onClick`
   * decides what that meant instead.
   *
   * The selection is rewritten live on every move rather than once at the end, so the
   * outlines follow the band — which is the only way to tell before letting go that
   * the band has caught the row above the one you wanted. That is also why the base
   * selection is captured up front: an additive band has to be able to *shrink*, and
   * a union accumulated across moves never gives anything back.
   */
  const beginMarquee = useCallback(
    (origin: { x: number; y: number }, additive: boolean, onClick?: () => void) => {
      const frame = doc;
      const surfaces: DragSurface[] = [studioSurface()];
      const inFrame = frame ? frameSurface(frame, () => stateRef.current.viewport.zoom) : null;
      if (inFrame) surfaces.push(inFrame);

      const base = additive ? [...stateRef.current.selectedIds] : [];
      let swept = false;
      let done = false;

      const finish = (commit: boolean) => {
        if (done) return;
        done = true;
        for (const { doc: surfaceDoc } of surfaces) {
          surfaceDoc.removeEventListener('pointermove', onMove, true);
          surfaceDoc.removeEventListener('pointerup', onUp, true);
          surfaceDoc.removeEventListener('pointercancel', onCancel, true);
          surfaceDoc.removeEventListener('keydown', onKeyDown, true);
        }
        setBand(null);
        if (!swept) {
          if (commit) onClick?.();
        } else if (!commit) {
          // Escape puts back what was there before the band was drawn.
          stateRef.current.selectMany(base);
        }
      };

      function onMove(this: Document, event: Event) {
        const surface = surfaces.find((candidate) => candidate.doc === this);
        if (!surface) return;

        const rect = marqueeRect(origin, surface.toStudio(event as PointerEvent));
        if (!swept && !isMarquee(rect)) return;
        swept = true;
        setBand(rect);

        const { page: current, viewport: view, selectMany } = stateRef.current;
        // Re-measured per move rather than cached at the start: a pan or a zoom during
        // the gesture moves every element, and a stale rect would select the node that
        // used to be under the band.
        const projection = frame ? frameProjection(frame, view.zoom) : null;
        const found = nodesInMarquee({
          page: current,
          band: rect,
          rectOf: (id) => (frame && projection ? measure(frame, id, projection) : null),
          // Own flags, not inherited ones: the walk stops at the node it skips, so a
          // locked container already takes its children with it.
          skip: (id) => Boolean(current.nodes[id]?.locked) || Boolean(current.nodes[id]?.hidden),
        });

        selectMany([...base, ...found.filter((id) => !base.includes(id))]);
      }

      function onUp() {
        finish(true);
      }
      function onCancel() {
        finish(false);
      }
      function onKeyDown(event: Event) {
        if ((event as KeyboardEvent).key === 'Escape') finish(false);
      }

      for (const { doc: surfaceDoc } of surfaces) {
        surfaceDoc.addEventListener('pointermove', onMove, true);
        surfaceDoc.addEventListener('pointerup', onUp, true);
        surfaceDoc.addEventListener('pointercancel', onCancel, true);
        surfaceDoc.addEventListener('keydown', onKeyDown, true);
      }
    },
    [doc],
  );

  /* --- Pointer behaviour inside the frame ---------------------------------- */

  useEffect(() => {
    if (!doc) return;

    const onPointerOver = (event: Event) => hover(nodeIdOf(event.target));
    const onPointerLeave = () => hover(null);

    const onPointerDown = (event: Event) => {
      const pointer = event as PointerEvent;

      // The middle button pans from wherever it is pressed. Space does too, but it
      // makes the frame inert first, so that gesture never reaches this handler.
      if (pointer.button === 1) {
        pointer.preventDefault();
        const projection = frameProjection(doc, stateRef.current.viewport.zoom);
        if (!projection) return;
        const point = toStudioPoint(pointer.clientX, pointer.clientY, projection);
        beginPan(point.x, point.y);
        return;
      }

      if (pointer.button !== 0) return;

      const id = nodeIdOf(pointer.target);
      const { page: current, selectedIds: held } = stateRef.current;

      // A locked node is not selectable on the canvas — that is the whole of what a
      // lock does. It stays reachable from the layers tree, which is also where it can
      // be unlocked, and the current selection is left alone rather than cleared.
      if (id && isLocked(current, id)) return;

      const additive = isAdditive(pointer);
      // The page root fills the artboard, so pressing it is pressing the background.
      // It is still selectable — styling the page is done through it — but only by a
      // press that stays a click, which leaves the gesture free to be a band.
      const draggableId = id && current.nodes[id]?.parentId !== null ? id : null;

      pointer.preventDefault();

      // preventDefault above stops the frame taking focus, which is what keeps the
      // design inert — but it also means focus stays wherever it last was. Coming
      // from the palette's search field, that would leave Delete deleting a character
      // instead of the node the user just clicked. Selecting on the canvas has to
      // move the keyboard to the canvas.
      areaRef.current?.focus({ preventScroll: true });

      const surface = frameSurface(doc, () => stateRef.current.viewport.zoom);
      if (!surface) return;
      const origin = surface.toStudio(pointer);

      // A band, either because there is nothing under the pointer to drag or because
      // the modifier says the gesture is about the selection rather than about moving
      // anything. Its click fallback is what keeps plain selection working: press,
      // don't move, let go, and the node under the cursor is selected as before.
      if (!draggableId || additive) {
        beginMarquee(origin, additive, () => select(id, { additive }));
        return;
      }

      // Pressing something already in a multi-selection keeps the whole selection, so
      // the drag can carry all of it. A press that never becomes a drag falls back to
      // selecting just this one, which is how a selection is narrowed again.
      const inSelection = held.length > 1 && held.includes(draggableId);
      if (!inSelection) select(draggableId);

      // The root is the page itself — it has nowhere to move to.
      if (!canDrag(current, draggableId)) return;

      const source = { kind: 'move', nodeId: draggableId } as const;

      beginDragSession({
        studio: stateRef.current,
        source,
        label: inSelection
          ? `${held.length} layers`
          : dragLabel(current, source, stateRef.current.specFor),
        origin,
        // Both documents: the gesture starts in the frame but can finish anywhere.
        surfaces: [surface, studioSurface()],
        ...(inSelection ? { onClick: () => select(draggableId) } : {}),
      });
    };

    // The canvas shows a picture of the page, not a working copy of it. Swallowing
    // clicks in the capture phase is what keeps a button from being pressed, a link
    // from navigating the frame, and a form from submitting while it is being edited.
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    // A keystroke inside a frame is delivered to that frame's document and stops
    // there. Delete, Escape and the zoom shortcuts are editor commands wherever the
    // pointer happens to be, so they are re-raised on the studio's window, where the
    // bindings live — one handler instead of one per focusable surface.
    //
    // Both directions of the key: Space is held down to pan, and a keyup that never
    // arrived would leave the canvas armed for a pan the user had let go of.
    const forwardKey = (event: Event) => {
      const key = event as KeyboardEvent;

      // Space scrolls a document by default, and the design must stay inert.
      if (key.code === 'Space') key.preventDefault();

      window.dispatchEvent(
        new KeyboardEvent(key.type, {
          key: key.key,
          code: key.code,
          repeat: key.repeat,
          ctrlKey: key.ctrlKey,
          metaKey: key.metaKey,
          shiftKey: key.shiftKey,
          altKey: key.altKey,
        }),
      );
    };

    doc.addEventListener('pointerover', onPointerOver, true);
    doc.addEventListener('pointerleave', onPointerLeave, true);
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('click', swallow, true);
    doc.addEventListener('submit', swallow, true);
    doc.addEventListener('keydown', forwardKey);
    doc.addEventListener('keyup', forwardKey);

    return () => {
      doc.removeEventListener('pointerover', onPointerOver, true);
      doc.removeEventListener('pointerleave', onPointerLeave, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('click', swallow, true);
      doc.removeEventListener('submit', swallow, true);
      doc.removeEventListener('keydown', forwardKey);
      doc.removeEventListener('keyup', forwardKey);
    };
  }, [doc, hover, select, beginPan, beginMarquee]);

  // Inert whenever the pointer is doing something to the canvas as a whole rather than
  // to a node in it: mid-drag the resolver asks the frame's document directly, mid-band
  // the gesture belongs to the studio's document, and while panning or armed to pan the
  // frame must neither hit-test nor set the cursor.
  const frameInert = drag !== null || panning || panReady || band !== null;

  return (
    <div
      ref={areaRef}
      className={[
        styles.area,
        panning ? styles.areaPanning : '',
        !panning && panReady ? styles.areaPanReady : '',
      ]
        .filter(Boolean)
        .join(' ')}
      // Focusable, but not in the tab order: it is a focus *destination* for a click
      // on the canvas, not a stop on the way to the inspector.
      tabIndex={-1}
      onPointerDown={(event) => {
        if (panReady || event.button === 1) {
          event.preventDefault();
          beginPan(event.clientX, event.clientY);
          return;
        }

        if (event.button !== 0 || event.target !== event.currentTarget) return;

        // A modifier turns the backdrop press into a band instead, which is how a
        // marquee can start outside the artboard and sweep into it — the one thing
        // the plain gesture below cannot do, because it is a pan.
        if (isAdditive(event)) {
          event.preventDefault();
          areaRef.current?.focus({ preventScroll: true });
          beginMarquee({ x: event.clientX, y: event.clientY }, true);
          return;
        }

        // The backdrop is not part of the design, so a press on it has nothing to
        // select and can simply move the view — the same gesture as Space+drag, with
        // no modifier, which is how the canvas is dragged into a comfortable position
        // without first learning a shortcut.
        event.preventDefault();
        areaRef.current?.focus({ preventScroll: true });
        beginPan(event.clientX, event.clientY);

        // A click on the backdrop still means "nothing selected" — but only if it
        // stayed a click. Clearing on the press instead would drop the selection
        // every time the user nudged the view to look at the thing they had
        // selected, which is exactly when they need it kept.
        const start = { x: event.clientX, y: event.clientY };
        const onUp = (up: PointerEvent) => {
          document.removeEventListener('pointerup', onUp, true);
          document.removeEventListener('pointercancel', onUp, true);
          if (up.type !== 'pointerup') return;
          const moved = Math.hypot(up.clientX - start.x, up.clientY - start.y);
          if (moved <= CLICK_SLOP) select(null);
        };
        document.addEventListener('pointerup', onUp, true);
        document.addEventListener('pointercancel', onUp, true);
      }}
    >
      {/* The pan/zoom transform, applied once to a wrapper — §5.4. Everything inside it
          is in artboard coordinates and knows nothing about either. */}
      <div className={styles.scene} style={{ transform: sceneTransform(viewport) }}>
        <div
          className={styles.artboard}
          style={{ width: artboardWidth, height: ARTBOARD_SIZE.height }}
        >
          <CanvasFrame
            title="Design canvas"
            className={[styles.frame, frameInert ? styles.frameInert : '']
              .filter(Boolean)
              .join(' ')}
            onDocument={onDocument}
          >
            {/* `cell` is what makes the canvas an editing view rather than a browser
                at a width: it caps the stylesheet at the breakpoint being edited and
                forces the selected node's pseudo-state on. Neither reaches the
                preview or the export, which take no `cell` at all. */}
            <PageRenderer
              page={page}
              symbols={symbols}
              theme={theme}
              // Editing a component renders it against its own defaults, which is what a
              // placement that sets nothing would show. Without them every binding in it
              // would draw its fallback, and a component is not buildable if you cannot
              // see what it does.
              props={symbolProps}
              editing
              cell={{ ...cell, nodeId: selectedId }}
              // Expressions compile in the frame's realm, not the studio's — see
              // `evaluate.ts`. Null until the frame's document exists, which is one
              // render, and the compile cache is keyed by realm so nothing is reused
              // across the two.
              realm={doc?.defaultView ?? null}
            />
          </CanvasFrame>
        </div>
      </div>

      {/* Chrome. Never inside the frame, so the user's CSS cannot reach it and the
          export never contains it — and never inside the transformed scene either, or
          a 2px outline would be 0.5px at 25% zoom. Hover is suppressed mid-drag, where
          the drop indicator is the only feedback that matters. */}
      {hoverRect && !drag ? (
        <div className={styles.hoverOutline} style={rectStyle(hoverRect)} aria-hidden />
      ) : null}

      {selectionRects.map((placed) => (
        <SelectionOutline
          key={placed.id}
          rect={placed.rect}
          node={page.nodes[placed.id]}
          // Only the primary is named. Six labels stacked over six outlines is a
          // second set of boxes over the design, and the one being edited is the only
          // one the inspector is talking about anyway.
          labelled={!drag && placed.id === selectedId}
        />
      ))}

      {band ? <div className={styles.marquee} style={rectStyle(band)} aria-hidden /> : null}
    </div>
  );
}

function SelectionOutline({
  rect,
  node,
  labelled,
}: {
  rect: Rect;
  node: Node | undefined;
  labelled: boolean;
}) {
  const { specFor } = useStudio();

  return (
    <div className={styles.selectionOutline} style={rectStyle(rect)} aria-hidden>
      {labelled && node ? (
        <span
          className={[
            styles.selectionLabel,
            node.parentId === null ? styles.selectionLabelRoot : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {node.name}
          {specFor(node.type) === undefined ? ' (unknown)' : ''}
        </span>
      ) : null}
    </div>
  );
}

function rectStyle(rect: Rect): React.CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

function samePlacedRects(a: readonly PlacedRect[], b: readonly PlacedRect[]): boolean {
  return (
    a.length === b.length &&
    a.every((placed, index) => {
      const other = b[index];
      return other !== undefined && placed.id === other.id && sameRect(placed.rect, other.rect);
    })
  );
}
