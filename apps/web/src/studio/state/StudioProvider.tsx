import { useCallback, useMemo, useRef, useState } from 'react';
import { createNodeFor, createProjectDoc, specFor } from '@ui-builder/components';
import {
  REQUIRES,
  canMoveInto,
  canPlaceSymbol,
  deleteNode,
  duplicateNode,
  findPage,
  findSymbol,
  hasAtLeast,
  insertNode,
  isLocked,
  moveNode,
  moveNodes,
  setNodeProp,
  setNodeStyles,
  symbolIdOf,
  topmostNodes,
  updatePage,
  updateSymbol,
  type NodeId,
  type Page,
  type ProjectDoc,
  type PropValue,
  type Role,
  type SymbolDef,
} from '@ui-builder/schema';
import {
  ARTBOARD_SIZE,
  DEFAULT_VIEWPORT,
  artboardWidthFor,
  type Viewport,
} from '../canvas/viewport.js';
import {
  DROP_SURFACES,
  StudioContext,
  type DragSource,
  type DropResolver,
  type DropSurfaceKey,
  type DragState,
  type EditCell,
  type EditOptions,
  type EditTarget,
  type SelectOptions,
  type ViewportControl,
} from './context.js';
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  createHistory,
  pushHistory,
  redo as redoHistory,
  resetHistory,
  undo as undoHistory,
  type History,
} from './history.js';
import { usePersistence, type Persistence } from './usePersistence.js';

/** How far the pointer must travel before a press becomes a drag rather than a click. */
export const DRAG_THRESHOLD_PX = 4;

/** One frozen empty array, so "nothing selected" is always the same reference. */
const NO_SELECTION: readonly NodeId[] = Object.freeze([]);

export interface StudioProjectRef {
  id: string;
  name: string;
  /** The caller's role in the owning workspace — what decides read-only. */
  role: Role;
}

/**
 * The page being edited.
 *
 * Derived from a stored id rather than held as its own piece of state, for the reason
 * the selection is (see `selectedId`): an undo can remove the page the panels are
 * pointed at, and a stored id that no longer names a page has to read as "the first
 * one" in the same render — not be corrected by an effect a frame later.
 *
 * `ProjectDocSchema` requires at least one page and every document is validated on the
 * way in, so the throw is unreachable — it is here so the impossible case is loud rather
 * than an empty canvas with no explanation.
 */
function activePage(doc: ProjectDoc, pageId: string): Page {
  const page = findPage(doc, pageId) ?? doc.pages[0];
  if (!page) throw new Error('A document must have at least one page.');
  return page;
}

/**
 * A symbol as the `Page` every panel already knows how to edit.
 *
 * The empty `state` and `queries` are honest rather than a placeholder: a symbol has
 * neither by design (§12), which is what keeps a reusable component from depending on the
 * page it happened to be dropped on. The Data view is swapped for the prop surface while
 * one is open, so nothing can write to the two collections that are dropped on the way
 * back out in `editDoc`.
 */
function symbolAsPage(symbol: SymbolDef): Page {
  return {
    id: symbol.id,
    name: symbol.name,
    path: '',
    rootId: symbol.rootId,
    nodes: symbol.nodes,
    state: [],
    queries: [],
  };
}

interface Surface {
  target: EditTarget;
  page: Page;
  symbol: SymbolDef | null;
}

/**
 * What the panels are pointed at, resolved against the document as it is now.
 *
 * Derived rather than corrected, for `activePage`'s reason: an undo can delete the symbol
 * being edited, and the answer in that same render has to be a page rather than an empty
 * canvas that an effect puts right a frame later.
 */
function resolveSurface(doc: ProjectDoc, target: EditTarget, pageId: string): Surface {
  if (target.kind === 'symbol') {
    const symbol = findSymbol(doc, target.id);
    if (symbol) return { target, page: symbolAsPage(symbol), symbol };
  }

  const page = activePage(doc, pageId);
  return { target: { kind: 'page', id: page.id }, page, symbol: null };
}

/**
 * Loads one project's document, then hands it to the editor below.
 *
 * The split is not cosmetic: everything in `StudioSession` exists only once there *is*
 * a document, and folding the two together means every piece of editing state has to
 * spend the first render describing what it would be if there were nothing to edit.
 * Keeping the load here also means `children` — the whole studio — never render against
 * a missing page, so no panel needs a null check for a state that lasts one request.
 */
export function StudioProvider({
  project,
  children,
  fallback,
}: {
  project: StudioProjectRef;
  children: React.ReactNode;
  /** Rendered instead of `children` while the document is loading or unreadable. */
  fallback: (state: {
    status: string;
    problem: string | null;
    retry: () => void;
  }) => React.ReactNode;
}) {
  const [history, setHistory] = useState<History<ProjectDoc> | null>(null);

  const writable = hasAtLeast(project.role, REQUIRES.projectWrite);

  const handleLoaded = useCallback(
    (loaded: ProjectDoc | null) => {
      // A project with no saved document gets one here rather than on the server: the
      // starter page is built out of the component registry, which the API deliberately
      // cannot see (PLAN.md §2). It arrives dirty, so the first autosave writes it.
      setHistory(createHistory(loaded ?? createProjectDoc({ id: project.id, name: project.name })));
    },
    [project.id, project.name],
  );

  const persistence = usePersistence({
    projectId: project.id,
    doc: history?.present ?? null,
    writable,
    onLoaded: handleLoaded,
  });

  const retry = useCallback(() => {
    // A reload is the honest retry: what failed was the first request of the session,
    // and half of what would have to be reset is state this component is holding.
    window.location.reload();
  }, []);

  if (!history) {
    return fallback({ status: persistence.status, problem: persistence.problem, retry });
  }

  return (
    <StudioSession
      history={history}
      setHistory={setHistory}
      persistence={persistence}
      writable={writable}
    >
      {children}
    </StudioSession>
  );
}

/**
 * Studio state for one open project's document.
 *
 * The document lives here rather than in the canvas because three panels edit it and
 * all three must agree — and because every mutation goes through `schema/ops`, which
 * returns a new `ProjectDoc` sharing everything it did not touch. That is what makes
 * the undo stack in `history.ts` an array of these values rather than a diffing problem,
 * and what makes an autosave a comparison of two references.
 */
function StudioSession({
  history,
  setHistory,
  persistence,
  writable,
  children,
}: {
  history: History<ProjectDoc>;
  setHistory: React.Dispatch<React.SetStateAction<History<ProjectDoc> | null>>;
  persistence: Persistence;
  writable: boolean;
  children: React.ReactNode;
}) {
  const [selection, setSelection] = useState<readonly NodeId[]>(NO_SELECTION);
  const [hoveredId, setHoveredId] = useState<NodeId | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const doc = history.present;

  // The page the three panels are pointed at. A document always opens on its first page:
  // page order is the author's own, so "the first one" is the one they put first.
  const [pageId, setPageId] = useState(() => doc.pages[0]?.id ?? '');
  // Which surface — that page, or one of the document's reusable components. The page id
  // is kept alongside rather than replaced, so closing a component returns to the page the
  // author was on rather than to the first one.
  const [editTarget, setEditTarget] = useState<EditTarget>(() => ({ kind: 'page', id: pageId }));

  const { target: surface, page, symbol } = resolveSurface(doc, editTarget, pageId);

  // Editing opens on the unconditional cell: mobile-first means base is the layout
  // that always applies, and a first edit that landed in `lg` would leave a design
  // with nothing at all below 1024px.
  const [cell, setCellState] = useState<EditCell>({ breakpoint: 'base', state: 'default' });
  const [artboardWidth, setArtboardWidth] = useState(ARTBOARD_SIZE.width);

  // The canvas replaces this with a fit on its first layout; 100% is only what is shown
  // for the frame or two before it has been measured.
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [viewportControl, setViewportControl] = useState<ViewportControl | null>(null);

  // A ref, not state: each panel re-registers its resolver whenever its geometry
  // changes, and storing them in state would re-render every panel each time the
  // canvas scrolls.
  const dropResolvers = useRef<Partial<Record<DropSurfaceKey, DropResolver>>>({});

  const resolveDropAt = useCallback((x: number, y: number, source: DragSource) => {
    for (const surface of DROP_SURFACES) {
      const target = dropResolvers.current[surface]?.(x, y, source);
      if (target) return target;
    }
    return null;
  }, []);

  // The drag is also mirrored into a ref so `endDrag` can read the target that the
  // last pointermove computed. Reading it from state would commit whatever React had
  // rendered by then, which on a fast drop is one move behind the cursor.
  const dragRef = useRef<DragState | null>(null);

  const setDragState = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Editing                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * The one way the document changes.
   *
   * Every mutation — a node op, a page op, a restore — ends up here, so the history push
   * and the read-only check exist once rather than at every call site. A transform that
   * returns the document it was given costs nothing: `pushHistory` drops it.
   */
  const editDocument = useCallback(
    (transform: (doc: ProjectDoc) => ProjectDoc, options: EditOptions = {}) => {
      if (!writable) return;
      setHistory((current) => {
        if (!current) return current;
        const next = transform(current.present);
        return pushHistory(current, next, options.coalesce ? { coalesce: options.coalesce } : {});
      });
    },
    [setHistory, writable],
  );

  /**
   * A `schema/ops` transform against the page being edited.
   *
   * The two modules speak different units — `ops.ts` takes a `Page`, `pages.ts` takes a
   * `ProjectDoc` — and `updatePage` is the seam between them. It is applied inside the
   * updater rather than against `page` from the render, so a rapid edit reads the
   * document as it is now; and the active id is re-resolved for the case where an undo
   * has removed the page since the last render.
   */
  const editDoc = useCallback(
    (transform: (page: Page) => Page, options?: EditOptions) => {
      editDocument((current) => {
        const surface = resolveSurface(current, editTarget, pageId);

        if (surface.target.kind === 'page') {
          return updatePage(current, surface.page.id, transform);
        }

        // Only the tree half of the result is kept. A symbol has no state, queries or path,
        // and the panels that write those are not reachable while one is open — so this is
        // where the page view stops being a page again, in the one place that knows it
        // ever was one.
        return updateSymbol(current, surface.target.id, (held) => {
          const next = transform(symbolAsPage(held));
          return next.nodes === held.nodes && next.rootId === held.rootId
            ? held
            : { ...held, rootId: next.rootId, nodes: next.nodes };
        });
      }, options);
    },
    [editDocument, editTarget, pageId],
  );

  /**
   * Moves the panels to another page.
   *
   * The selection needs no reset — it is derived from `page.nodes`, so an id from the
   * page being left stops resolving on the same render. The hover is cleared anyway
   * rather than left to expire: it drives an overlay drawn over the canvas, and one
   * frame of a highlight on the wrong page is worth the one line.
   *
   * Not an edit. Which page you are looking at is not part of the document, and undo
   * should not walk back through a tour of it.
   */
  const selectPage = useCallback((next: string) => {
    setPageId(next);
    setEditTarget({ kind: 'page', id: next });
    setHoveredId(null);
  }, []);

  /**
   * Opens a reusable component on the same canvas.
   *
   * The selection is left to expire on its own, as `selectPage` leaves it: it is derived
   * from the surface's nodes, so an id from the page being left stops resolving on this
   * very render. Not an edit, for `selectPage`'s reason — which surface you are looking at
   * is not part of the document, and undo should not walk back through a tour of it.
   */
  const editSymbol = useCallback((symbolId: string) => {
    setEditTarget({ kind: 'symbol', id: symbolId });
    setHoveredId(null);
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => (current ? undoHistory(current) : current));
  }, [setHistory]);

  const redo = useCallback(() => {
    setHistory((current) => (current ? redoHistory(current) : current));
  }, [setHistory]);

  /**
   * Undo can remove a node the panels are pointed at, and so can a restore or a
   * conflict resolved the other way. The selection is therefore *derived* — ids that no
   * longer name a node simply drop out — rather than corrected by an effect after the
   * fact. An effect would leave one render in which the inspector was pointed at a node
   * that is not there.
   *
   * The stored array is returned unchanged when every id still resolves, which is the
   * usual case: a fresh array on every render would change the context value on every
   * render, and this one is read by all three panels.
   */
  const selectedIds = useMemo(
    () =>
      selection.every((id) => page.nodes[id])
        ? selection
        : selection.filter((id) => page.nodes[id]),
    [selection, page],
  );

  const selectedId = selectedIds[selectedIds.length - 1] ?? null;

  const select = useCallback((id: NodeId | null, options?: SelectOptions) => {
    setSelection((current) => {
      if (id === null) return NO_SELECTION;
      if (!options?.additive) {
        // Re-selecting what is already the whole selection keeps the reference, so a
        // repeated click on one node does not re-render the studio.
        return current.length === 1 && current[0] === id ? current : [id];
      }
      // Ctrl/⌘ on something already in the set removes it — the same modifier undoes
      // its own last press, which is what makes a mis-click cheap.
      return current.includes(id) ? current.filter((held) => held !== id) : [...current, id];
    });
  }, []);

  const selectMany = useCallback((ids: readonly NodeId[], options?: SelectOptions) => {
    setSelection((current) => {
      if (!options?.additive) return ids.length > 0 ? [...ids] : NO_SELECTION;
      // A union, not a toggle: a marquee dragged over something already selected means
      // "these as well", and toggling would silently deselect whatever it swept past.
      const merged = [...current];
      for (const id of ids) if (!merged.includes(id)) merged.push(id);
      return merged.length === current.length ? current : merged;
    });
  }, []);

  const hover = useCallback((id: NodeId | null) => setHoveredId(id), []);

  /**
   * Moving to a breakpoint also moves the artboard to that breakpoint's width.
   *
   * Editing a cell you cannot see is the failure mode this phase exists to avoid: a
   * `md` rule authored on a 1024px artboard is invisible under the `lg` rules that
   * also apply there. Switching the target and the width together is one gesture with
   * one meaning, and the width control stays free to move on its own afterwards.
   */
  const setCell = useCallback(
    (next: Partial<EditCell>) => {
      setCellState((current) => {
        const merged = { ...current, ...next };
        if (next.breakpoint !== undefined && next.breakpoint !== current.breakpoint) {
          setArtboardWidth(artboardWidthFor(doc.theme, next.breakpoint));
        }
        return merged;
      });
    },
    [doc.theme],
  );

  /**
   * A style write lands on every selected node, not only the primary.
   *
   * The coalesce key names the whole selection, so holding an arrow key on a length
   * with three nodes selected is still one undo step — and changing the selection
   * between two writes starts a new one, which is the honest boundary.
   */
  const setStyle = useCallback(
    (decls: Record<string, string | number | undefined>) => {
      if (selectedIds.length === 0) return;
      editDoc(
        (existing) =>
          selectedIds.reduce(
            (current, id) =>
              current.nodes[id] ? setNodeStyles(current, id, { ...cell, decls }) : current,
            existing,
          ),
        // Writes to the same properties of the same cell within the coalesce window are
        // one gesture — a colour picker being dragged, an arrow key held on a length.
        // A different property is a different decision and gets its own step.
        {
          coalesce: `style:${selectedIds.join(',')}:${cell.breakpoint}:${cell.state}:${Object.keys(
            decls,
          )
            .sort()
            .join(',')}`,
        },
      );
    },
    [cell, editDoc, selectedIds],
  );

  const setProp = useCallback(
    (name: string, value: PropValue | undefined) => {
      if (!selectedId) return;
      editDoc(
        (existing) => {
          // The primary's type is what the Props tab generated its fields from, so it is
          // also what decides who the write applies to.
          const type = existing.nodes[selectedId]?.type;
          if (type === undefined) return existing;
          return selectedIds.reduce(
            (current, id) =>
              current.nodes[id]?.type === type ? setNodeProp(current, id, name, value) : current,
            existing,
          );
        },
        { coalesce: `prop:${selectedIds.join(',')}:${name}` },
      );
    },
    [editDoc, selectedId, selectedIds],
  );

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    // No matching deselect: the selection is derived from the document, so a node that
    // is gone is deselected by the same edit that removed it — including when an undo
    // brings it back, which reselects it.
    editDoc((existing) =>
      // Topmost only: with a stack and its child both selected, deleting the stack
      // already takes the child, and asking for the child afterwards would throw.
      topmostNodes(existing, selectedIds).reduce((current, id) => {
        const node = current.nodes[id];
        // The root is the page itself, and a locked node is pinned: neither goes.
        if (!node || node.parentId === null || isLocked(current, id)) return current;
        return deleteNode(current, id);
      }, existing),
    );
  }, [editDoc, selectedIds]);

  const duplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    editDoc((existing) =>
      topmostNodes(existing, selectedIds).reduce((current, id) => {
        const node = current.nodes[id];
        if (!node || node.parentId === null || isLocked(current, id)) return current;
        return duplicateNode(current, id);
      }, existing),
    );
  }, [editDoc, selectedIds]);

  const beginDrag = useCallback(
    (source: DragSource, label: string, x: number, y: number) => {
      setDragState({ source, label, x, y, target: resolveDropAt(x, y, source) });
    },
    [resolveDropAt, setDragState],
  );

  const moveDrag = useCallback(
    (x: number, y: number) => {
      const current = dragRef.current;
      if (!current) return;
      setDragState({ ...current, x, y, target: resolveDropAt(x, y, current.source) });
    },
    [resolveDropAt, setDragState],
  );

  const endDrag = useCallback(
    (commit: boolean) => {
      const current = dragRef.current;
      setDragState(null);
      if (!commit || !current?.target) return;

      const { source, target } = current;

      if (source.kind === 'new') {
        const spec = specFor(source.componentKey, doc.symbols);
        if (!spec) return;

        // A component may not contain itself, directly or through another. The palette
        // declines to offer one that would, so the drag never starts — this is the
        // backstop for the gap between a drag beginning and it landing, which is the same
        // gap the move below re-checks `canMoveInto` for.
        const droppedSymbol = symbolIdOf(source.componentKey);
        if (
          droppedSymbol !== null &&
          !canPlaceSymbol(doc, droppedSymbol, surface.kind === 'symbol' ? surface.id : null)
        ) {
          return;
        }

        const node = createNodeFor(spec);
        editDoc((existing) =>
          insertNode(existing, { node, parentId: target.parentId, index: target.index }),
        );
        // Selecting what was just dropped is what makes "drag it, then style it" one
        // gesture instead of two.
        setSelection([node.id]);
        return;
      }

      // Dragging one member of a multi-selection drags the whole of it. The press that
      // started this gesture deliberately left the selection alone when it landed on
      // something already in it (see the canvas and the layers tree), which is what
      // makes the set still be here to move.
      const moving = selectedIds.includes(source.nodeId) ? selectedIds : [source.nodeId];

      editDoc((existing) => {
        // The document can have changed since the drag began, and a drop into a node
        // that is now a descendant of a dragged one would detach the subtree.
        if (moving.length > 1) {
          return moveNodes(existing, moving, target.parentId, target.index);
        }
        if (!canMoveInto(existing, source.nodeId, target.parentId)) return existing;
        return moveNode(existing, {
          nodeId: source.nodeId,
          newParentId: target.parentId,
          index: target.index,
        });
      });
      setSelection(moving);
    },
    // `doc` and `surface` are read to decide whether a component may be placed here. They
    // change on every edit, so the closure this commits through is always the current one.
    [doc, surface, editDoc, selectedIds, setDragState],
  );

  const setDropResolver = useCallback((surface: DropSurfaceKey, resolve: DropResolver | null) => {
    if (resolve) dropResolvers.current[surface] = resolve;
    else delete dropResolvers.current[surface];
  }, []);

  /**
   * Adopts a restored document without going back through the save loop.
   *
   * The server already wrote it — sending it straight back would be a second, identical
   * revision — so the baseline moves with it and the history starts again there.
   */
  const adoptDoc = useCallback(
    (next: ProjectDoc, version: number) => {
      setHistory(resetHistory(next));
      setSelection(NO_SELECTION);
      persistence.markSaved(next, version);
    },
    [persistence, setHistory],
  );

  const canUndoNow = historyCanUndo(history);
  const canRedoNow = historyCanRedo(history);

  // Bound to the open document so no panel has to remember to pass the symbols in. Rebuilt
  // only when the symbol list itself changes, because it is a context value every panel
  // reads and a fresh function each render would re-render all of them.
  const boundSpecFor = useCallback((type: string) => specFor(type, doc.symbols), [doc.symbols]);

  const value = useMemo(
    () => ({
      doc,
      page,
      target: surface,
      symbol,
      symbols: doc.symbols,
      specFor: boundSpecFor,
      selectPage,
      editSymbol,
      theme: doc.theme,
      writable,
      selectedId,
      selectedIds,
      hoveredId,
      drag,
      viewport,
      cell,
      setCell,
      artboardWidth,
      setArtboardWidth,
      select,
      selectMany,
      hover,
      setViewport,
      viewportControl,
      setViewportControl,
      edit: editDoc,
      editDocument,
      undo,
      redo,
      canUndo: canUndoNow,
      canRedo: canRedoNow,
      persistence,
      adoptDoc,
      deleteSelected,
      duplicateSelected,
      setStyle,
      setProp,
      beginDrag,
      moveDrag,
      endDrag,
      setDropResolver,
    }),
    [
      doc,
      page,
      surface,
      symbol,
      boundSpecFor,
      selectPage,
      editSymbol,
      writable,
      selectedId,
      selectedIds,
      hoveredId,
      drag,
      viewport,
      cell,
      setCell,
      artboardWidth,
      select,
      selectMany,
      hover,
      viewportControl,
      editDoc,
      editDocument,
      undo,
      redo,
      canUndoNow,
      canRedoNow,
      persistence,
      adoptDoc,
      deleteSelected,
      duplicateSelected,
      setStyle,
      setProp,
      beginDrag,
      moveDrag,
      endDrag,
      setDropResolver,
    ],
  );

  return <StudioContext value={value}>{children}</StudioContext>;
}
