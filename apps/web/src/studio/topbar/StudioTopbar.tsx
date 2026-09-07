import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft, Code2, Eye, Minus, Plus, Redo2, Undo2 } from 'lucide-react';
import type { ProjectSummary, WorkspaceSummary } from '@ui-builder/schema';
import { UserMenu } from '../../shell/UserMenu.js';
import { Button } from '../../ui/Button.js';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu.js';
import { ZOOM_MAX, ZOOM_MIN } from '../canvas/viewport.js';
import { CodeDialog } from '../code/CodeDialog.js';
import { useStudio } from '../state/context.js';
import { MOD_LABEL } from '../shortcuts.js';
import { HistoryMenu } from './HistoryMenu.js';
import { SaveStatus } from './SaveStatus.js';
import styles from './StudioTopbar.module.css';

/** The presets worth a menu row. More than three turns a control into a list (§8). */
const ZOOM_PRESETS = [0.5, 1, 2];

function ZoomControl() {
  const { viewport, viewportControl } = useStudio();
  const percent = Math.round(viewport.zoom * 100);

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.tool}
        title="Zoom out"
        aria-label="Zoom out"
        disabled={!viewportControl || viewport.zoom <= ZOOM_MIN}
        onClick={() => viewportControl?.zoomStep(-1)}
      >
        <Minus size={14} />
      </button>

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className={styles.zoom}
            title="Zoom"
            aria-label={`Zoom, currently ${percent}%`}
            disabled={!viewportControl}
          >
            {percent}%
          </button>
        </MenuTrigger>
        <MenuContent align="center">
          <MenuItem detail={`${MOD_LABEL}1`} onSelect={() => viewportControl?.fit()}>
            Zoom to fit
          </MenuItem>
          <MenuSeparator />
          {ZOOM_PRESETS.map((zoom) => (
            <MenuItem
              key={zoom}
              detail={zoom === 1 ? `${MOD_LABEL}0` : undefined}
              onSelect={() => viewportControl?.zoomTo(zoom)}
            >
              {Math.round(zoom * 100)}%
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>

      <button
        type="button"
        className={styles.tool}
        title="Zoom in"
        aria-label="Zoom in"
        disabled={!viewportControl || viewport.zoom >= ZOOM_MAX}
        onClick={() => viewportControl?.zoomStep(1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

/** Undo and redo, live as of Phase 8. */
function HistoryControl() {
  const { undo, redo, canUndo, canRedo, writable } = useStudio();

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.tool}
        title={`Undo (${MOD_LABEL}Z)`}
        aria-label="Undo"
        disabled={!writable || !canUndo}
        onClick={undo}
      >
        <Undo2 size={14} />
      </button>
      <button
        type="button"
        className={styles.tool}
        title={`Redo (${MOD_LABEL}⇧Z)`}
        aria-label="Redo"
        disabled={!writable || !canRedo}
        onClick={redo}
      >
        <Redo2 size={14} />
      </button>
    </div>
  );
}

/**
 * Preview, live as of Phase 9.
 *
 * It flushes the autosave before navigating, because the preview route reads the *saved*
 * document from the API — it is a view of what the server holds, the same thing a shared
 * link and (Phase 10) an export are built from. Without the flush, everything typed in the
 * last second of editing would simply be missing from it, which is the kind of gap that
 * makes a preview stop being believed.
 *
 * The same tab rather than a new one: every piece of studio state is per-mount either way,
 * so a new tab would not preserve the undo stack — it would only add a second copy of the
 * editor holding a document that the first one keeps changing.
 */
function PreviewButton({ projectId }: { projectId: string }) {
  const { doc, page, symbol, persistence } = useStudio();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  // A conflict or a failed save means the document on screen is not the one the preview
  // would load. Saying so is better than showing a page that is quietly out of date.
  const blocked = persistence.status === 'conflict' || persistence.status === 'error';

  // A component has no route of its own — it is a piece of a page, and the preview shows
  // pages. Editing one previews the first page instead, which is where a component can
  // actually be seen doing its job.
  const previewId = symbol ? (doc.pages[0]?.id ?? page.id) : page.id;

  const open = async () => {
    setLeaving(true);
    await persistence.saveNow();
    await navigate(`/preview/${projectId}/${previewId}`);
  };

  return (
    <Button
      variant="ghost"
      disabled={blocked || leaving}
      title={
        blocked
          ? 'Resolve the save problem first — the preview shows the saved document'
          : symbol
            ? 'Preview the first page — a component has no route of its own'
            : 'Preview this page'
      }
      onClick={() => void open()}
    >
      <Eye size={14} aria-hidden="true" />
      Preview
    </Button>
  );
}

/**
 * The generated code, live as of Phase 10.
 *
 * No save flush, unlike Preview: this is generated in the browser from the document on
 * screen, so there is nothing for the server to have caught up with.
 */
function CodeButton() {
  const { doc } = useStudio();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" title="View the generated React code" onClick={() => setOpen(true)}>
        <Code2 size={14} aria-hidden="true" />
        Code
      </Button>
      <CodeDialog doc={doc} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * The editor's own top bar.
 *
 * Undo/redo and preview were laid in disabled from Phase 2 rather than added later:
 * their width is what decides how much room the project name gets, and discovering that
 * after the fact would mean redoing the row. Undo/redo, the save indicator and the
 * history menu went live in Phase 8, preview in Phase 9 — and the row never moved.
 */
export function StudioTopbar({
  project,
  workspace,
}: {
  project: ProjectSummary;
  workspace: WorkspaceSummary | undefined;
}) {
  return (
    <header className={styles.bar}>
      <Link
        to={workspace ? `/w/${workspace.slug}` : '/'}
        className={styles.back}
        title="Back to projects"
        aria-label="Back to projects"
      >
        <ChevronLeft size={16} />
      </Link>

      <div className={styles.title}>
        <span className={styles.name}>{project.name}</span>
        <span className={styles.meta}>{workspace?.name ?? 'Workspace'}</span>
      </div>

      <SaveStatus />

      <span className={styles.spacer} />

      <HistoryControl />

      <ZoomControl />

      <span className={styles.spacer} />

      <div className={styles.actions}>
        <HistoryMenu projectId={project.id} />
        <CodeButton />
        <PreviewButton projectId={project.id} />
        <span className={styles.divider} aria-hidden="true" />
        <UserMenu />
      </div>
    </header>
  );
}
