import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, File, MoreHorizontal, Plus, Settings2, Trash2 } from 'lucide-react';
import { createPage } from '@ui-builder/components';
import {
  addPage,
  copyPage,
  deletePage,
  movePage,
  pageIndexOf,
  uniquePageName,
  uniquePagePath,
  type Page,
} from '@ui-builder/schema';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu.js';
import { useStudio } from '../state/context.js';
import { PageSettingsDialog } from './PageSettingsDialog.js';
import styles from './Pages.module.css';

/** How far the pointer must travel before a press on a row becomes a reorder. */
const REORDER_THRESHOLD_PX = 4;

const rowDomId = (id: string) => `page-${id}`;

/**
 * Whether an event really happened inside the element handling it.
 *
 * The row's menu renders into a portal at the document root but stays a *React* child of
 * the row that opened it, and React bubbles events through its own tree rather than the
 * DOM's. Without this check, pressing a menu item runs the row's `pointerdown`, which
 * captures the pointer — and the `pointerup` that would have selected the item is
 * retargeted to the row instead. The menu never closes and the command never runs.
 *
 * `contains` is the DOM truth, which is the one that matters here.
 */
function isOwnEvent(event: React.SyntheticEvent<HTMLElement>): boolean {
  return event.currentTarget.contains(event.target as Node);
}

/**
 * The pages list — the document's second axis.
 *
 * The layers tree is the outline of one page; this is the list of them. It sits above
 * both the palette and the tree because it is the coarser choice: which page you are
 * editing decides what those two are even showing.
 *
 * Every command here goes through `editDocument` with a `schema/pages` op, the same way
 * the layers tree goes through `edit` with a `schema/ops` one — so adding, deleting and
 * reordering pages land on the undo stack and in the autosave without a second path.
 */
export function Pages() {
  const { doc, page, writable, selectPage, editDocument } = useStudio();

  const [settingsFor, setSettingsFor] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  /* --- Commands -------------------------------------------------------------- */

  /**
   * A new blank page, selected on arrival.
   *
   * The page — and therefore its ids — is built here rather than inside the updater,
   * which may run more than once; `selectPage` below has to name the id that was
   * actually committed. Its name and path are resolved against the document *inside*
   * the updater, so a collision cannot slip in between this render and the click.
   */
  const addBlankPage = useCallback(() => {
    const blank = createPage();

    editDocument((current) =>
      addPage(current, {
        page: {
          ...blank,
          name: uniquePageName(current, 'Page'),
          path: uniquePagePath(current, '/page'),
        },
      }),
    );

    selectPage(blank.id);
  }, [editDocument, selectPage]);

  const duplicate = useCallback(
    (pageId: string) => {
      const copy = copyPage(doc, pageId);

      editDocument((current) =>
        // The copy's ids are fixed, but its name and path are re-resolved: `copyPage`
        // read them from the document as it was rendered, and `addPage` refuses a
        // collision rather than quietly renaming.
        addPage(current, {
          page: {
            ...copy,
            name: uniquePageName(current, copy.name),
            path: uniquePagePath(current, copy.path),
          },
          index: pageIndexOf(current, pageId) + 1,
        }),
      );

      selectPage(copy.id);
    },
    [doc, editDocument, selectPage],
  );

  const remove = useCallback(
    (pageId: string) => {
      // No matching `selectPage`: the active page is derived, so deleting the one being
      // edited falls back to the first — including when an undo brings it back.
      editDocument((current) => (current.pages.length > 1 ? deletePage(current, pageId) : current));
    },
    [editDocument],
  );

  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      editDocument((current) => movePage(current, from, to));
    },
    [editDocument],
  );

  /* --- Reordering ------------------------------------------------------------ */

  const drag = useReorderDrag({ enabled: writable, listRef, onReorder: reorder });

  /* --- Keyboard -------------------------------------------------------------- */

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const index = pageIndexOf(doc, page.id);

      const step = (delta: number) => {
        const next = doc.pages[index + delta];
        if (next) selectPage(next.id);
      };

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          step(1);
          break;

        case 'ArrowUp':
          event.preventDefault();
          step(-1);
          break;

        case 'Enter':
        case 'F2':
          event.preventDefault();
          if (writable) setSettingsFor(page.id);
          break;

        default:
          break;
      }
    },
    [doc, page.id, selectPage, writable],
  );

  /* --- Render ---------------------------------------------------------------- */

  const settingsPage = settingsFor
    ? doc.pages.find((entry) => entry.id === settingsFor)
    : undefined;

  return (
    <div className={styles.pages}>
      <div
        ref={listRef}
        className={styles.list}
        role="listbox"
        aria-label="Pages"
        // One tab stop for the list, with the active row named rather than focused —
        // the same arrangement as the layers tree, for the same reason.
        tabIndex={0}
        aria-activedescendant={rowDomId(page.id)}
        onKeyDown={onKeyDown}
      >
        {doc.pages.map((entry, index) => (
          <Row
            key={entry.id}
            page={entry}
            active={entry.id === page.id}
            writable={writable}
            // The last page cannot go: the schema requires one, so the delete would
            // fail validation on the next save rather than at the click.
            deletable={doc.pages.length > 1}
            dragging={drag.index === index && drag.active}
            insertBefore={drag.active && drag.to === index}
            insertAfter={
              drag.active && drag.to === doc.pages.length && index === doc.pages.length - 1
            }
            onSelect={selectPage}
            onPointerDown={(event) => drag.begin(event, index)}
            onOpenSettings={setSettingsFor}
            onDuplicate={duplicate}
            onDelete={remove}
          />
        ))}
      </div>

      {writable && (
        <button type="button" className={styles.add} onClick={addBlankPage}>
          <Plus size={13} strokeWidth={2} aria-hidden />
          New page
        </button>
      )}

      {settingsPage && (
        <PageSettingsDialog
          page={settingsPage}
          open
          onOpenChange={(next) => {
            if (!next) setSettingsFor(null);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                         */
/* -------------------------------------------------------------------------- */

interface RowProps {
  page: Page;
  active: boolean;
  writable: boolean;
  deletable: boolean;
  dragging: boolean;
  insertBefore: boolean;
  insertAfter: boolean;
  onSelect: (pageId: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onOpenSettings: (pageId: string) => void;
  onDuplicate: (pageId: string) => void;
  onDelete: (pageId: string) => void;
}

function Row({
  page,
  active,
  writable,
  deletable,
  dragging,
  insertBefore,
  insertAfter,
  onSelect,
  onPointerDown,
  onOpenSettings,
  onDuplicate,
  onDelete,
}: RowProps) {
  const className = [
    styles.row,
    active && styles.rowActive,
    dragging && styles.rowDragging,
    insertBefore && styles.rowInsertBefore,
    insertAfter && styles.rowInsertAfter,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      id={rowDomId(page.id)}
      className={className}
      role="option"
      aria-selected={active}
      onPointerDown={(event) => {
        if (event.button !== 0 || !isOwnEvent(event)) return;
        onSelect(page.id);
        onPointerDown(event);
      }}
      onDoubleClick={(event) => {
        if (writable && isOwnEvent(event)) onOpenSettings(page.id);
      }}
    >
      <File className={styles.icon} size={13} strokeWidth={1.75} aria-hidden />

      <span className={styles.name}>{page.name}</span>
      <span className={styles.path}>{page.path}</span>

      {writable && (
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              // The list is a single tab stop; this is a pointer affordance, and the
              // row it belongs to is reachable by arrow key and Enter.
              tabIndex={-1}
              className={styles.menuButton}
              title={`Page options for ${page.name}`}
              aria-label={`Page options for ${page.name}`}
              // Opening the menu must not also start a reorder.
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal size={13} strokeWidth={2} aria-hidden />
            </button>
          </MenuTrigger>

          <MenuContent align="end">
            <MenuItem icon={<Settings2 size={13} />} onSelect={() => onOpenSettings(page.id)}>
              Page settings…
            </MenuItem>
            <MenuItem icon={<Copy size={13} />} onSelect={() => onDuplicate(page.id)}>
              Duplicate
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 size={13} />}
              danger
              disabled={!deletable}
              onSelect={() => onDelete(page.id)}
            >
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reordering                                                                  */
/* -------------------------------------------------------------------------- */

interface ReorderDrag {
  /** The row being dragged, or null. */
  index: number | null;
  /** Where it would land — an index *between* rows, so it ranges 0..length. */
  to: number | null;
  /** False until the pointer has passed the threshold, so a click is still a click. */
  active: boolean;
  begin: (event: React.PointerEvent<HTMLElement>, index: number) => void;
}

/**
 * Drag-to-reorder, local to this list.
 *
 * Deliberately not the studio's drag session: that machinery exists to carry one drag
 * across three surfaces that each answer "where would this land?" differently, and a
 * page has exactly one place it can go. Reusing it would mean registering a fourth drop
 * surface to move a row eight pixels.
 *
 * The pointer is captured on the row, so the whole gesture stays in this document even
 * when the cursor crosses the canvas iframe — the same reason the palette and the
 * layers tree capture.
 */
function useReorderDrag({
  enabled,
  listRef,
  onReorder,
}: {
  enabled: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  onReorder: (from: number, to: number) => void;
}): ReorderDrag {
  const [state, setState] = useState<{ index: number; to: number; active: boolean } | null>(null);

  // The move and up handlers read the live gesture; keeping it only in state would
  // commit whatever React had rendered by the time the pointer was released.
  const gesture = useRef<{ index: number; to: number; active: boolean; startY: number } | null>(
    null,
  );

  const begin = useCallback(
    (event: React.PointerEvent<HTMLElement>, index: number) => {
      if (!enabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { index, to: index, active: false, startY: event.clientY };
      setState({ index, to: index, active: false });
    },
    [enabled],
  );

  // Whether a gesture is open, rather than the gesture itself: the effect below writes
  // `state` on every pointermove, and depending on the value would tear the listeners
  // down and rebuild them once per frame of the drag.
  const dragging = state !== null;

  useEffect(() => {
    if (!dragging) return;

    const rows = () =>
      Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

    const onMove = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current) return;

      const active =
        current.active || Math.abs(event.clientY - current.startY) >= REORDER_THRESHOLD_PX;
      if (!active) return;

      // The gap the pointer is nearest: a row's own midpoint splits "above it" from
      // "below it", so the landing index is the count of midpoints already passed.
      let to = 0;
      for (const row of rows()) {
        const rect = row.getBoundingClientRect();
        if (event.clientY > rect.top + rect.height / 2) to += 1;
      }

      gesture.current = { ...current, active, to };
      setState({ index: current.index, to, active });
    };

    const finish = (commit: boolean) => {
      const current = gesture.current;
      gesture.current = null;
      setState(null);
      if (!commit || !current?.active) return;

      // `to` counts gaps, and removing the row first shifts every gap below it up one.
      onReorder(current.index, current.to > current.index ? current.to - 1 : current.to);
    };

    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [dragging, listRef, onReorder]);

  return {
    index: state?.index ?? null,
    to: state?.to ?? null,
    active: state?.active ?? false,
    begin,
  };
}
