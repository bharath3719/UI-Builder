import { createContext, use } from 'react';
import type { ComponentSpec } from '@ui-builder/components';
import type {
  NodeId,
  Page,
  ProjectDoc,
  PropValue,
  StyleState,
  SymbolDef,
  Theme,
} from '@ui-builder/schema';
import type { Rect, Viewport } from '../canvas/viewport.js';
import type { Persistence } from './usePersistence.js';

/**
 * What is being dragged — PLAN.md §6. Two sources, one target system: a component
 * key from the palette becomes a new node, a node id becomes a move. Everything
 * downstream of the drag (hit-testing, the indicator, the commit) is identical.
 */
export type DragSource = { kind: 'new'; componentKey: string } | { kind: 'move'; nodeId: NodeId };

/** Where a drop would land, plus the geometry to draw for it, in studio coordinates. */
export interface DropTarget {
  parentId: NodeId;
  index: number;
  indicator: DropIndicator;
  context: DropContext;
}

/**
 * The same drop, in words and in landmarks.
 *
 * A bare line says *where* on screen the node will go; in a layout the user did not
 * build themselves that is not enough to say *what* it will end up beside — flush
 * elements share edges, and a gap between two of them looks the same from either side.
 * So the target also carries the names involved and the receiving container's bounds,
 * which is what the overlay turns into a label and an outline.
 */
export interface DropContext {
  /** The receiving container's layer name. */
  parentName: string;
  /** The existing child the line reads against — null when there is nothing to name. */
  anchor: DropAnchor | null;
  /** The receiving container's bounds, if the surface can measure them. */
  parentRect: Rect | null;
}

/**
 * A neighbour, and which side of it the node lands on.
 *
 * Never the node being dragged: "after Card" is only true of a Card that is staying
 * where it is, so a resolver picks the nearest sibling that is not itself in flight.
 */
export interface DropAnchor {
  name: string;
  edge: 'before' | 'after';
}

/**
 * A line between two children, or a box around a container that has none. The box
 * form matters: an empty stack has no gaps to draw a line in, and "this will go
 * inside here" is a different statement from "this will go between these two".
 */
export type DropIndicator =
  | { kind: 'line'; left: number; top: number; width: number; height: number }
  | { kind: 'box'; left: number; top: number; width: number; height: number };

export interface DragState {
  source: DragSource;
  /** Cursor position in studio client coordinates. */
  x: number;
  y: number;
  target: DropTarget | null;
  /** What to show in the ghost that follows the cursor. */
  label: string;
}

/**
 * Given a point in studio client coordinates, where would a drop go? The panel that
 * owns the geometry answers — only the canvas knows the iframe's offset, only the
 * layers tree knows where its rows are — and the drag controller just takes the first
 * answer it gets.
 */
export type DropResolver = (x: number, y: number, source: DragSource) => DropTarget | null;

/**
 * The surfaces a drop can land on, in the order they are asked.
 *
 * The tree is asked first because the canvas resolver answers for *any* point: a
 * hit-test that misses everything falls back to the page root, so asking the canvas
 * first would swallow every drop that happened over a panel. Each resolver returns
 * null for a point outside its own bounds, which is what makes the order a total one.
 */
export const DROP_SURFACES = ['layers', 'canvas'] as const;

export type DropSurfaceKey = (typeof DROP_SURFACES)[number];

/**
 * The zoom commands, published by the canvas because it is the only thing that knows
 * how big the visible area is.
 *
 * A zoom needs an anchor to be worth anything (§5.4), and the anchor for a command that
 * did not come from the pointer is the middle of the area. Putting the commands here
 * rather than the area's size in state keeps that arithmetic in one place — the
 * alternative is every caller re-deriving a centre point and getting it subtly wrong.
 */
export interface ViewportControl {
  /** Zooms about the centre of the visible area. */
  zoomTo: (zoom: number) => void;
  /** Walks to the next zoom stop above (`1`) or below (`-1`) the current one. */
  zoomStep: (direction: 1 | -1) => void;
  /** Fits the whole artboard in the area, centred. */
  fit: () => void;
}

/**
 * The cell of the style set the inspector writes to — PLAN.md §9.
 *
 * One value rather than two pieces of panel state because three things read it: the
 * fields (to resolve what to show), the canvas (to cap the stylesheet and force the
 * state), and every write. Splitting it would let them disagree for a render.
 */
export interface EditCell {
  breakpoint: string;
  state: StyleState;
}

/**
 * How a click changes the selection.
 *
 * One flag rather than a `'replace' | 'add' | 'toggle'` mode, because there is only one
 * modifier: Ctrl/⌘ means "and this one too, or not this one after all", which is a
 * toggle in both directions. A range — Shift in the layers tree — is not a mode either;
 * the tree works out which rows the range covers and hands them over as a list, because
 * "between these two" is a question only the thing that knows the row order can answer.
 */
export interface SelectOptions {
  additive?: boolean;
}

/** Per-edit knobs. Today only coalescing; the shape is here so adding one is not a churn. */
export interface EditOptions {
  /**
   * Edits sharing a key in quick succession become one undo step. Omit for anything
   * that is always its own decision — a drop, a delete, a rename.
   */
  coalesce?: string;
}

/**
 * Which of the document's two kinds of node tree the panels are pointed at — a page, or
 * one of its reusable components (PLAN.md §12).
 *
 * The canvas, the layers tree, the drag controller and the inspector all take a `Page`,
 * and a symbol is a `NodeTree` with a name and a prop surface rather than a path and some
 * state. So the studio hands them a *page view* of whichever is active and keeps the
 * distinction here, in the one place that has to know: the seam that commits an edit.
 * The alternative — teaching thirty-six files that a surface has two shapes — buys
 * nothing, because none of them care.
 */
export type EditTarget = { kind: 'page'; id: string } | { kind: 'symbol'; id: string };

export interface StudioState {
  /** The whole document. `page` is the one being edited; both are the same object graph. */
  doc: ProjectDoc;
  /**
   * The surface being edited. A real page, or the page view of a symbol — read `target`
   * to tell which, and only where the difference matters.
   */
  page: Page;
  /**
   * What `page` is a view of. Derived from a stored id, so a symbol removed by an undo
   * resolves back to a page in the same render rather than a frame later.
   */
  target: EditTarget;
  /** The symbol being edited, or null when the surface is a page. */
  symbol: SymbolDef | null;
  /** The document's reusable components — what the palette lists and the canvas renders. */
  symbols: readonly SymbolDef[];
  /**
   * The spec for a node type, the library's and this document's alike.
   *
   * Bound to the open document so no panel has to remember to pass the symbols in — a
   * caller that used the bare `getSpec` would silently draw every instance as an unknown
   * component, which is the failure this exists to make impossible.
   */
  specFor: (type: string) => ComponentSpec | undefined;
  /**
   * Points the panels at another page. Read `target` for what is active — it is derived,
   * so a page removed by an undo resolves to the first one rather than to nothing.
   */
  selectPage: (pageId: string) => void;
  /** Opens a reusable component for editing on the same canvas. */
  editSymbol: (symbolId: string) => void;
  theme: Theme;
  /** False for a viewer. Every edit is a no-op, and the panels offer read-only controls. */
  writable: boolean;

  /**
   * Everything selected, in the order it was added, filtered to what the page still
   * has. Empty is no selection; one is the ordinary case.
   */
  selectedIds: readonly NodeId[];
  /**
   * The *primary* of the selection — the one added last — or null.
   *
   * A multi-selection still has to answer single-node questions: which node's values
   * the inspector's fields show, whose pseudo-state the canvas forces, which row the
   * layers tree names in `aria-activedescendant`, and where a Shift-range starts from.
   * The last one clicked is the answer to all of them, because it is the one the user
   * was most recently pointing at.
   */
  selectedId: NodeId | null;
  hoveredId: NodeId | null;
  drag: DragState | null;
  viewport: Viewport;

  /** Which breakpoint/state the inspector is editing. */
  cell: EditCell;
  setCell: (next: Partial<EditCell>) => void;
  /**
   * The artboard's width. Driven by the breakpoint switcher — a responsive rule that
   * cannot be seen at a width where it applies cannot be judged — but adjustable on
   * its own, which is what Phase 9's device presets become a control over.
   */
  artboardWidth: number;
  setArtboardWidth: (width: number) => void;

  select: (id: NodeId | null, options?: SelectOptions) => void;
  /** The marquee's and the Shift-range's way in: a whole set at once. */
  selectMany: (ids: readonly NodeId[], options?: SelectOptions) => void;
  hover: (id: NodeId | null) => void;

  setViewport: (next: Viewport | ((current: Viewport) => Viewport)) => void;
  /** Null until the canvas has mounted and measured itself. */
  viewportControl: ViewportControl | null;
  setViewportControl: (control: ViewportControl | null) => void;

  /**
   * Applies a `schema/ops` transform to the surface being edited, recording one undo step.
   *
   * The transform sees a `Page` whichever surface is active, and only the tree half of what
   * it returns is kept when that surface is a symbol — a symbol has no state, no queries
   * and no path, and the panels that write those are not reachable while one is open.
   */
  edit: (transform: (page: Page) => Page, options?: EditOptions) => void;
  /**
   * The same, one level up: a `schema/pages` transform against the whole document, for
   * the operations whose unit is a page rather than a node — add, delete, reorder,
   * rename, re-path. Shares the history and the read-only check with `edit`.
   */
  editDocument: (transform: (doc: ProjectDoc) => ProjectDoc, options?: EditOptions) => void;
  /**
   * Both act on the whole selection, and on its *topmost* members only: with a stack
   * and something inside it both selected, the stack goes and the child goes with it
   * rather than being deleted twice or duplicated into a copy that already has one.
   */
  deleteSelected: () => void;
  duplicateSelected: () => void;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  /** Load state, save status and conflict resolution for this project's document. */
  persistence: Persistence;
  /**
   * Installs a document the server has already stored — what a restore returns. Resets
   * the history and the save baseline together, so neither can point at a state the
   * other has moved past.
   */
  adoptDoc: (doc: ProjectDoc, version: number) => void;

  /**
   * Writes declarations into the active cell for every selected node. `undefined`
   * clears a property, which is how a field resets to whatever it inherits rather
   * than pinning an explicit value.
   */
  setStyle: (decls: Record<string, string | number | undefined>) => void;
  /**
   * Writes one prop on every selected node of the primary's component type;
   * `undefined` removes it. The type check is not a formality — `variant` on a Button
   * and `variant` on a Badge are different props that happen to share a name, and the
   * Props tab only offers a field at all when the whole selection is one component.
   */
  setProp: (name: string, value: PropValue | undefined) => void;

  beginDrag: (source: DragSource, label: string, x: number, y: number) => void;
  moveDrag: (x: number, y: number) => void;
  /** Commits at the current target, or cancels if there is none. */
  endDrag: (commit: boolean) => void;

  /** Registers (or, with null, withdraws) one surface's answer to "where would this land?". */
  setDropResolver: (surface: DropSurfaceKey, resolve: DropResolver | null) => void;
}

export const StudioContext = createContext<StudioState | null>(null);

export function useStudio(): StudioState {
  const state = use(StudioContext);
  if (!state) throw new Error('useStudio must be used inside <StudioProvider>');
  return state;
}
