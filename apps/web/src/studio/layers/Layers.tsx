import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleQuestionMark,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
} from 'lucide-react';
import { ICON_BY_KEY, SYMBOL_ICON_COMPONENT as SYMBOL_ICON } from '@ui-builder/components/react';
import {
  isDescendant,
  nodePath,
  renameNode,
  setNodeFlags,
  symbolIdOf,
  type Node,
  type NodeId,
} from '@ui-builder/schema';
import { beginDragSession, studioSurface } from '../dnd/dragSession.js';
import { canDrag } from '../dnd/rules.js';
import { useStudio } from '../state/context.js';
import { resolveLayerDrop, type MeasuredRow } from './resolveLayerDrop.js';
import { flattenTree, layerIndent, type LayerRow } from './tree.js';
import styles from './Layers.module.css';

/** `aria-activedescendant` needs a real element id; node ids are already URL-safe. */
const rowDomId = (id: NodeId) => `layer-${id}`;

type Flag = 'hidden' | 'locked';

/** What a row inherits from its ancestors, which is how both flags actually behave. */
interface RowFlags {
  hidden: boolean;
  locked: boolean;
}

function measureRows(rows: LayerRow[], elements: Map<NodeId, HTMLElement>): MeasuredRow[] {
  const measured: MeasuredRow[] = [];

  for (const row of rows) {
    const element = elements.get(row.id);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    measured.push({
      id: row.id,
      depth: row.depth,
      expanded: row.expanded,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    });
  }

  return measured;
}

/**
 * The layers outline — PLAN.md §5, the second view onto the same document.
 *
 * The canvas can only select what is painted and visible; the tree is how a node that
 * is nested, empty, hidden behind another or scrolled out of frame is reachable at all.
 * It reads the same `page.nodes`, drives the same `select`, and is the third surface
 * the one drag session works across.
 */
export function Layers() {
  const studio = useStudio();
  const { page, selectedId, selectedIds, hoveredId, drag, select, selectMany, hover, edit } =
    studio;

  const [collapsed, setCollapsed] = useState<ReadonlySet<NodeId>>(() => new Set<NodeId>());
  const [renamingId, setRenamingId] = useState<NodeId | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<NodeId, HTMLElement>());
  // Escape cancels a rename by unmounting the input, which also blurs it — and blur is
  // what commits. The flag is how the commit path knows it was cancelled.
  const cancelledRef = useRef(false);

  /**
   * A collapsed ancestor of the selection is opened here rather than by writing back
   * into `collapsed`: selection arrives from the canvas too, and an effect that
   * expanded on every such change would be a second source of truth for the same
   * state. Collapsing a container that holds the selection moves the selection to the
   * container instead (see `toggleCollapsed`), so the two rules never fight.
   */
  const revealed = useMemo(() => {
    if (!selectedId || collapsed.size === 0) return collapsed;

    const ancestors = nodePath(page, selectedId).slice(0, -1);
    if (!ancestors.some((node) => collapsed.has(node.id))) return collapsed;

    const next = new Set(collapsed);
    for (const node of ancestors) next.delete(node.id);
    return next;
  }, [collapsed, page, selectedId]);

  const rows = useMemo(() => flattenTree(page, revealed), [page, revealed]);

  /**
   * Effective flags. Pre-order guarantees a parent's row is computed before its
   * children's, and a child only has a row when its parent is expanded — so one pass
   * down the list is enough to inherit.
   */
  const flags = useMemo(() => {
    const state = new Map<NodeId, RowFlags>();

    for (const row of rows) {
      const node = page.nodes[row.id];
      const parent = node?.parentId ? state.get(node.parentId) : undefined;
      state.set(row.id, {
        hidden: Boolean(node?.hidden) || Boolean(parent?.hidden),
        locked: Boolean(node?.locked) || Boolean(parent?.locked),
      });
    }

    return state;
  }, [page, rows]);

  // The drop resolver and the drag session run from pointer handlers and need the
  // studio as it is now, not as it was when the effect that registered them last ran.
  const stateRef = useRef(studio);
  const rowsRef = useRef(rows);
  useEffect(() => {
    stateRef.current = studio;
    rowsRef.current = rows;
  });

  /* --- Drop resolution ------------------------------------------------------ */

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    studio.setDropResolver('layers', (x, y, source) =>
      resolveLayerDrop({
        page: stateRef.current.page,
        rows: measureRows(rowsRef.current, rowRefs.current),
        // The scroll box, not the content: a point below the last row is only ours if
        // it is still inside the panel.
        bounds: list.getBoundingClientRect(),
        x,
        y,
        source,
      }),
    );

    return () => studio.setDropResolver('layers', null);
  }, [studio]);

  /* --- Keeping the selected row in view -------------------------------------- */

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, rows]);

  /* --- Commands -------------------------------------------------------------- */

  const registerRow = useCallback((id: NodeId, element: HTMLElement | null) => {
    if (element) rowRefs.current.set(id, element);
    else rowRefs.current.delete(id);
  }, []);

  const toggleCollapsed = useCallback(
    (id: NodeId) => {
      // Against `revealed`, not `collapsed`: a node held open because the selection is
      // inside it is *stored* as collapsed, so toggling the raw set would clear a flag
      // that was not doing anything and leave the row open. What is on screen is what
      // the caret has to act on — and writing `revealed` back commits the reveal.
      const closing = !revealed.has(id);

      setCollapsed(() => {
        const next = new Set(revealed);
        if (closing) next.add(id);
        else next.delete(id);
        return next;
      });

      // Closing a container that holds the selection would hide the selected row.
      // Selecting the container is the honest answer — and it is also what stops the
      // reveal above from immediately opening it again.
      if (closing && selectedId && selectedId !== id && isDescendant(page, id, selectedId)) {
        select(id);
      }
    },
    [page, revealed, select, selectedId],
  );

  const toggleFlag = useCallback(
    (id: NodeId, flag: Flag) => {
      edit((current) => setNodeFlags(current, id, { [flag]: !current.nodes[id]?.[flag] }));
    },
    [edit],
  );

  const focusTree = useCallback(() => listRef.current?.focus({ preventScroll: true }), []);

  const startRename = useCallback((id: NodeId) => {
    cancelledRef.current = false;
    setRenamingId(id);
  }, []);

  const cancelRename = useCallback(() => {
    cancelledRef.current = true;
    setRenamingId(null);
    listRef.current?.focus({ preventScroll: true });
  }, []);

  const commitRename = useCallback(
    (id: NodeId, value: string) => {
      setRenamingId(null);
      if (cancelledRef.current) {
        cancelledRef.current = false;
        return;
      }

      const name = value.trim();
      if (!name || name === page.nodes[id]?.name) return;
      edit((current) => renameNode(current, id, name));
    },
    [edit, page],
  );

  /**
   * The rows between the primary and `id`, inclusive, ending on `id`.
   *
   * Visible rows, not document order: Shift-clicking selects what the user could see
   * between the two, so a collapsed container contributes one row — itself — and not
   * the fifty layers hidden inside it.
   *
   * `id` goes last so it becomes the new primary, which is what makes a second
   * Shift-click extend from where the pointer actually is.
   */
  const rangeTo = useCallback(
    (id: NodeId): NodeId[] => {
      const to = rows.findIndex((row) => row.id === id);
      const from = selectedId ? rows.findIndex((row) => row.id === selectedId) : -1;
      if (to === -1) return [];
      if (from === -1) return [id];

      const span = rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((row) => row.id);
      return from <= to ? span : span.reverse();
    },
    [rows, selectedId],
  );

  const onRowPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, id: NodeId) => {
      if (event.button !== 0) return;

      // Deliberately *not* `preventDefault`: it suppresses the compatibility mouse
      // events, and double-click-to-rename is one of them. Text selection during a
      // drag is stopped with `user-select` in the stylesheet instead.
      //
      // Rows are not focusable — the tree is (see `aria-activedescendant` below) — and
      // without this the keyboard would stay wherever it was, typically the palette's
      // search field, where Delete deletes a character rather than the layer just
      // clicked.
      focusTree();

      const current = stateRef.current;

      // Shift takes the run between here and the primary; Ctrl/⌘ adds or removes this
      // one. Neither starts a drag: both are gestures about *what* is selected, and a
      // drag that also extended a selection would make an accidental nudge destructive.
      if (event.shiftKey) {
        selectMany(rangeTo(id));
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        select(id, { additive: true });
        return;
      }

      // Pressing a row that is already part of a multi-selection leaves the selection
      // alone, so the drag below carries all of it. Letting go without moving narrows
      // to this one row — the `onClick` below — which is how a selection is undone.
      const inSelection = current.selectedIds.length > 1 && current.selectedIds.includes(id);
      if (!inSelection) select(id);

      if (!canDrag(current.page, id)) return;

      // Capturing on the row keeps every later pointer event in the studio's document,
      // even while the cursor is over the canvas iframe — the same trick the palette
      // uses, and why one surface is enough here.
      event.currentTarget.setPointerCapture(event.pointerId);

      beginDragSession({
        studio: current,
        source: { kind: 'move', nodeId: id },
        label: inSelection
          ? `${current.selectedIds.length} layers`
          : (current.page.nodes[id]?.name ?? 'Layer'),
        origin: { x: event.clientX, y: event.clientY },
        surfaces: [studioSurface()],
        ...(inSelection ? { onClick: () => select(id) } : {}),
      });
    },
    [focusTree, rangeTo, select, selectMany],
  );

  /* --- Keyboard -------------------------------------------------------------- */

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Delete, Ctrl+D and Escape are studio-wide and handled once, on the window.
      if (renamingId) return;

      const index = rows.findIndex((row) => row.id === selectedId);
      const current = index === -1 ? undefined : rows[index];

      const step = (delta: number, extend = false) => {
        const next = rows[index === -1 ? (delta > 0 ? 0 : rows.length - 1) : index + delta];
        if (!next) return;

        if (!extend) {
          select(next.id);
          return;
        }

        // Shift+arrow grows the run, and shrinks it again on the way back. Stepping
        // onto a row that is *already* selected can only mean reversing over ground
        // just covered, so the answer is to drop the row being left rather than to add
        // one — and because the selection is held in the order it was built, dropping
        // the primary leaves the previous step as the new one.
        if (selectedIds.includes(next.id)) {
          selectMany(selectedIds.filter((id) => id !== selectedId));
          return;
        }
        selectMany([...selectedIds, next.id]);
      };

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          step(1, event.shiftKey);
          break;

        case 'ArrowUp':
          event.preventDefault();
          step(-1, event.shiftKey);
          break;

        case 'Home': {
          event.preventDefault();
          const first = rows[0];
          if (first) select(first.id);
          break;
        }

        case 'End': {
          event.preventDefault();
          const last = rows[rows.length - 1];
          if (last) select(last.id);
          break;
        }

        case 'ArrowRight':
          event.preventDefault();
          if (!current) break;
          // Open, then step in: two presses, the same as every other outline.
          if (current.hasChildren && !current.expanded) toggleCollapsed(current.id);
          else if (current.expanded) step(1);
          break;

        case 'ArrowLeft': {
          event.preventDefault();
          if (!current) break;
          if (current.expanded) {
            toggleCollapsed(current.id);
            break;
          }
          const parentId = page.nodes[current.id]?.parentId;
          if (parentId) select(parentId);
          break;
        }

        case 'Enter':
        case 'F2':
          if (!current) break;
          event.preventDefault();
          startRename(current.id);
          break;

        default:
          break;
      }
    },
    [
      page,
      renamingId,
      rows,
      select,
      selectMany,
      selectedId,
      selectedIds,
      startRename,
      toggleCollapsed,
    ],
  );

  /* --- Render ---------------------------------------------------------------- */

  // Every row the live drag is carrying, so a multi-node move dims all of them rather
  // than only the one the pointer happened to press.
  const dragged = drag?.source.kind === 'move' ? drag.source.nodeId : null;
  const moving = dragged === null ? [] : selectedIds.includes(dragged) ? selectedIds : [dragged];

  return (
    <div
      ref={listRef}
      className={styles.tree}
      role="tree"
      aria-label="Layers"
      // One tab stop for the whole tree, with the active row named rather than focused.
      // Roving focus would fight the rename input and the pointer-captured drag.
      tabIndex={0}
      aria-activedescendant={selectedId ? rowDomId(selectedId) : undefined}
      onKeyDown={onKeyDown}
      onPointerLeave={() => hover(null)}
    >
      {rows.map((row) => {
        const node = page.nodes[row.id];
        if (!node) return null;

        return (
          <Row
            key={row.id}
            row={row}
            node={node}
            flags={flags.get(row.id) ?? { hidden: false, locked: false }}
            selected={selectedIds.includes(row.id)}
            hovered={row.id === hoveredId && !drag}
            renaming={row.id === renamingId}
            dragging={moving.includes(row.id)}
            onRef={registerRow}
            onPointerDown={onRowPointerDown}
            onToggleCollapsed={toggleCollapsed}
            onToggleFlag={toggleFlag}
            onHover={hover}
            onStartRename={startRename}
            onCommitRename={commitRename}
            onCancelRename={cancelRename}
            onFocusTree={focusTree}
          />
        );
      })}
    </div>
  );
}

interface RowProps {
  row: LayerRow;
  node: Node;
  flags: RowFlags;
  selected: boolean;
  hovered: boolean;
  renaming: boolean;
  dragging: boolean;
  onRef: (id: NodeId, element: HTMLElement | null) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, id: NodeId) => void;
  onToggleCollapsed: (id: NodeId) => void;
  onToggleFlag: (id: NodeId, flag: Flag) => void;
  onHover: (id: NodeId | null) => void;
  onStartRename: (id: NodeId) => void;
  onCommitRename: (id: NodeId, value: string) => void;
  onCancelRename: () => void;
  onFocusTree: () => void;
}

function Row({
  row,
  node,
  flags,
  selected,
  hovered,
  renaming,
  dragging,
  onRef,
  onPointerDown,
  onToggleCollapsed,
  onToggleFlag,
  onHover,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onFocusTree,
}: RowProps) {
  const { specFor } = useStudio();
  const spec = specFor(node.type);
  // A spec names its icon and the library's React half holds the icons themselves, so
  // that reading a spec does not drag lucide into the API's bundle. The question mark is
  // for a node whose component the library no longer has — the same state the canvas
  // draws its red box for — which is why it is not the palette's generic square.
  //
  // A symbol's key carries its id, so it can never be in the table; one shared icon
  // stands for every instance. All three operands are module constants, which is what
  // React's compiler lint requires of a value that is then rendered.
  const Icon =
    ICON_BY_KEY[node.type] ?? (symbolIdOf(node.type) === null ? CircleQuestionMark : SYMBOL_ICON);
  const Caret = row.expanded ? ChevronDown : ChevronRight;

  const className = [
    styles.row,
    selected && styles.rowSelected,
    hovered && !selected && styles.rowHovered,
    flags.hidden && styles.rowHidden,
    dragging && styles.rowDragging,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      id={rowDomId(node.id)}
      ref={(element) => onRef(node.id, element)}
      className={className}
      style={{ paddingLeft: layerIndent(row.depth) }}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      {...(row.hasChildren ? { 'aria-expanded': row.expanded } : {})}
      onPointerDown={(event) => onPointerDown(event, node.id)}
      onPointerEnter={() => onHover(node.id)}
      onDoubleClick={() => onStartRename(node.id)}
    >
      {row.hasChildren ? (
        <span
          className={styles.caret}
          // Its own gesture, not the row's: expanding must not also select and must
          // never start a drag.
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleCollapsed(node.id);
          }}
          // A double-click on the caret is two toggles, not a rename.
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Caret size={12} strokeWidth={2} aria-hidden />
        </span>
      ) : (
        <span className={styles.caret} aria-hidden />
      )}

      <Icon className={styles.icon} size={13} strokeWidth={1.75} aria-hidden />

      {renaming ? (
        <input
          className={styles.rename}
          defaultValue={node.name}
          autoFocus
          aria-label="Layer name"
          onFocus={(event) => event.currentTarget.select()}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onBlur={(event) => onCommitRename(node.id, event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              // Blur is the single commit path, so Enter and clicking away agree.
              event.currentTarget.blur();
              onFocusTree();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              // The studio-wide Escape means "deselect"; here it means "keep the name".
              event.stopPropagation();
              onCancelRename();
            }
          }}
        />
      ) : (
        <span className={styles.name}>
          {node.name}
          {spec ? null : <span className={styles.unknown}> (unknown)</span>}
        </span>
      )}

      <span className={styles.actions} onDoubleClick={(event) => event.stopPropagation()}>
        <FlagButton
          on={Boolean(node.hidden)}
          inherited={flags.hidden && !node.hidden}
          onLabel="Show"
          offLabel="Hide"
          OnIcon={EyeOff}
          OffIcon={Eye}
          onToggle={() => onToggleFlag(node.id, 'hidden')}
        />
        <FlagButton
          on={Boolean(node.locked)}
          inherited={flags.locked && !node.locked}
          onLabel="Unlock"
          offLabel="Lock"
          OnIcon={Lock}
          OffIcon={LockOpen}
          onToggle={() => onToggleFlag(node.id, 'locked')}
        />
      </span>
    </div>
  );
}

/**
 * One of the two row toggles.
 *
 * Not in the tab order: the tree is a single tab stop, and thirty rows of two buttons
 * each would bury the inspector behind sixty tab presses. They are pointer
 * affordances, and the row they belong to is reachable by arrow key.
 */
function FlagButton({
  on,
  inherited,
  onLabel,
  offLabel,
  OnIcon,
  OffIcon,
  onToggle,
}: {
  on: boolean;
  /** Set on an ancestor rather than here — shown, but this row is not what clears it. */
  inherited: boolean;
  onLabel: string;
  offLabel: string;
  OnIcon: typeof Eye;
  OffIcon: typeof Eye;
  onToggle: () => void;
}) {
  const Icon = on || inherited ? OnIcon : OffIcon;

  return (
    <button
      type="button"
      tabIndex={-1}
      className={[styles.action, (on || inherited) && styles.actionOn].filter(Boolean).join(' ')}
      title={inherited ? `${onLabel} — inherited from a parent` : on ? onLabel : offLabel}
      aria-label={on ? onLabel : offLabel}
      aria-pressed={on}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      <Icon size={12} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
