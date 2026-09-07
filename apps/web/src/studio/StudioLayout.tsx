import { useCallback, useEffect, useState } from 'react';
import type { ProjectSummary, WorkspaceSummary } from '@ui-builder/schema';
import { Canvas } from './canvas/Canvas.js';
import { Data } from './data/Data.js';
import { DragOverlay } from './dnd/DragOverlay.js';
import { Inspector } from './inspector/Inspector.js';
import { Layers } from './layers/Layers.js';
import { Pages } from './pages/Pages.js';
import { Palette } from './palette/Palette.js';
import { Rail } from './rail/Rail.js';
import { Components } from './symbols/Components.js';
import { RAIL_LABELS, RAIL_VIEWS, type RailView } from './rail/views.js';
import { hasMod, isTyping } from './shortcuts.js';
import { StudioProvider } from './state/StudioProvider.js';
import { useStudio } from './state/context.js';
import { StudioTopbar } from './topbar/StudioTopbar.js';
import { ConflictDialog } from './topbar/ConflictDialog.js';
import { usePanelResize } from './usePanelResize.js';
import { Button } from '../ui/Button.js';
import { ScreenLoading, ScreenMessage } from '../ui/Screen.js';
import styles from './StudioLayout.module.css';

/**
 * A titled, scrollable region inside a panel.
 *
 * `flush` hands the padding and the scrolling to the content instead. The layers tree
 * wants it: its rows are full-bleed bands, and a padded scroll container would inset
 * every hover and selection fill from the panel edge.
 */
function Section({
  title,
  children,
  hidden = false,
  flush = false,
}: {
  title: string;
  children: React.ReactNode;
  /**
   * The rail's inactive views stay mounted and are hidden rather than unmounted, so
   * that switching back finds the palette scrolled where it was left and the layers
   * tree still collapsed the way it was arranged. Neither is state worth storing, and
   * both are irritating to lose.
   */
  hidden?: boolean;
  flush?: boolean;
}) {
  return (
    <div className={styles.section} hidden={hidden}>
      <div className={styles.sectionHeader}>{title}</div>
      <div
        className={[styles.sectionBody, flush ? styles.sectionBodyFlush : '']
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </div>
  );
}

const RAIL_STORAGE_KEY = 'ui-builder.rail.view';

/**
 * Which left-panel view is open, remembered per machine — the same place and the same
 * reasoning as the panel widths: it is a preference about this screen, not about the
 * document, so it belongs beside the other ones and not in the project.
 */
function useRailView(): [RailView | null, (view: RailView | null) => void] {
  const [view, setView] = useState<RailView | null>(() => {
    try {
      const stored = window.localStorage.getItem(RAIL_STORAGE_KEY);
      if (stored === '') return null;
      return RAIL_VIEWS.find((name) => name === stored) ?? 'library';
    } catch {
      // Private browsing, or storage turned off. A default is a fine answer.
      return 'library';
    }
  });

  const choose = useCallback((next: RailView | null) => {
    setView(next);
    try {
      window.localStorage.setItem(RAIL_STORAGE_KEY, next ?? '');
    } catch {
      // Not being able to remember the choice is no reason not to make it.
    }
  }, []);

  return [view, choose];
}

/**
 * Editing shortcuts, bound at the studio rather than on the canvas.
 *
 * The canvas is an iframe and the layers tree is not, so binding to whichever
 * currently has focus would make Delete work in one panel and not the other. Typing
 * is excluded explicitly: Backspace in the search field must delete a character, not
 * the selected layer.
 */
function useEditorShortcuts() {
  const {
    page,
    selectedId,
    deleteSelected,
    duplicateSelected,
    select,
    selectMany,
    drag,
    viewportControl,
    undo,
    redo,
    persistence,
  } = useStudio();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // ⌘S is the one shortcut that must work while typing: a field mid-edit is exactly
      // when someone reaches for it, and the browser's save dialog is never what they
      // meant. It flushes the debounce rather than doing anything a save would not.
      if (hasMod(event) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void persistence.saveNow();
        return;
      }

      if (isTyping(event.target)) return;

      // Undo and redo before the selection checks: they are document commands, and
      // there is nothing to select on a page that has just been undone back to empty.
      if (hasMod(event) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      // Select all, meaning every layer on the page — not the page itself, which is
      // the root and would make the selection one node that happens to contain the
      // rest. The browser's own Select All is what this replaces, and leaving it to
      // highlight the studio's chrome would be no use to anyone.
      if (hasMod(event) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectMany(page.nodes[page.rootId]?.children ?? []);
        return;
      }

      // Windows' other redo. ⌘Y is a browser shortcut on Mac, so it is not bound there.
      if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }

      // Zoom first, and regardless of what is selected: it is a view command, not an
      // editing one. Each of these is also a browser zoom, so none of them survives
      // without preventDefault.
      if (hasMod(event) && viewportControl) {
        if (event.key === '=' || event.key === '+') {
          event.preventDefault();
          viewportControl.zoomStep(1);
          return;
        }
        if (event.key === '-' || event.key === '_') {
          event.preventDefault();
          viewportControl.zoomStep(-1);
          return;
        }
        if (event.key === '0') {
          event.preventDefault();
          viewportControl.zoomTo(1);
          return;
        }
        if (event.key === '1') {
          event.preventDefault();
          viewportControl.fit();
          return;
        }
      }

      if (event.key === 'Escape') {
        // A live drag owns Escape — cancelling it is more urgent than deselecting.
        if (!drag) select(null);
        return;
      }

      if (!selectedId) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
        return;
      }

      if (hasMod(event) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelected();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    page,
    selectedId,
    deleteSelected,
    duplicateSelected,
    select,
    selectMany,
    drag,
    viewportControl,
    undo,
    redo,
    persistence,
  ]);
}

/**
 * The three-pane editor frame: palette and layers on the left, canvas in the middle,
 * inspector on the right.
 *
 * Built now, with the panes empty, because the frame is what every later phase mounts
 * into — the canvas host in Phase 4, the real palette in Phase 5, the inspector in
 * Phase 7. Getting the geometry, the resizing and the chrome settled first means those
 * phases add content rather than also renegotiating the layout.
 */
export function StudioLayout(props: {
  project: ProjectSummary;
  workspace: WorkspaceSummary | undefined;
}) {
  const { project } = props;

  return (
    <StudioProvider
      // Keyed on the project so that opening another one is a fresh mount. Every piece
      // of studio state below — the document, the history, the save baseline, the
      // viewport — is about *this* project, and resetting each of them by hand on a
      // prop change is a list that would be incomplete the first time one was added.
      key={project.id}
      project={{ id: project.id, name: project.name, role: project.role }}
      fallback={({ problem, retry }) =>
        problem ? (
          <ScreenMessage
            title="Could not open this document"
            message={problem}
            actions={<Button onClick={retry}>Try again</Button>}
          />
        ) : (
          <ScreenLoading label="Loading document" />
        )
      }
    >
      <StudioFrame {...props} />
    </StudioProvider>
  );
}

function StudioFrame({
  project,
  workspace,
}: {
  project: ProjectSummary;
  workspace: WorkspaceSummary | undefined;
}) {
  useEditorShortcuts();

  const left = usePanelResize({
    storageKey: 'ui-builder.panel.left',
    initial: 264,
    min: 200,
    max: 420,
    grow: 'right',
  });

  const right = usePanelResize({
    storageKey: 'ui-builder.panel.right',
    initial: 280,
    min: 200,
    max: 420,
    grow: 'left',
  });

  const [view, setView] = useRailView();

  return (
    <div className={styles.studio}>
      <StudioTopbar project={project} workspace={workspace} />

      <div className={styles.body}>
        <Rail view={view} onSelect={setView} />

        {/* All three views are mounted whenever the panel is open; the rail decides
            which one is shown. Collapsed, the panel and its separator go entirely —
            there is nothing left to resize. */}
        {view ? (
          <>
            <div className={`${styles.panel} ${styles.panelLeft}`} style={{ width: left.size }}>
              <Section title={RAIL_LABELS.pages} hidden={view !== 'pages'} flush>
                <Pages />
              </Section>

              <Section title={RAIL_LABELS.components} hidden={view !== 'components'} flush>
                <Components />
              </Section>

              <Section title={RAIL_LABELS.library} hidden={view !== 'library'}>
                <Palette />
              </Section>

              <Section title={RAIL_LABELS.layers} hidden={view !== 'layers'} flush>
                <Layers />
              </Section>

              <Section title={RAIL_LABELS.data} hidden={view !== 'data'} flush>
                <Data />
              </Section>
            </div>

            <div
              {...left.separatorProps}
              aria-label="Resize the left panel"
              className={[
                styles.separator,
                styles.separatorVertical,
                left.dragging && styles.separatorActive,
              ]
                .filter(Boolean)
                .join(' ')}
            />
          </>
        ) : null}

        <Canvas />

        <div
          {...right.separatorProps}
          aria-label="Resize the inspector"
          className={[
            styles.separator,
            styles.separatorVertical,
            right.dragging && styles.separatorActive,
          ]
            .filter(Boolean)
            .join(' ')}
        />

        <div className={`${styles.panel} ${styles.panelRight}`} style={{ width: right.size }}>
          <Section title="Inspector" flush>
            <Inspector />
          </Section>
        </div>
      </div>

      <DragOverlay />
      <ConflictDialog />
    </div>
  );
}
