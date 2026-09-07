import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { skipToken, useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  Maximize2,
  Monitor,
  Share2,
  Smartphone,
  Tablet,
} from 'lucide-react';
import type { Page } from '@ui-builder/schema';
import { ApiError } from '../api/client.js';
import * as documentsApi from '../api/documents.js';
import { keys, useProject } from '../api/queries.js';
import { formErrorMessage } from '../lib/formErrors.js';
import { UserMenu } from '../shell/UserMenu.js';
import { Button } from '../ui/Button.js';
import { Menu, MenuCheckItem, MenuContent, MenuTrigger } from '../ui/Menu.js';
import { ScreenLoading, ScreenMessage } from '../ui/Screen.js';
import { DEVICE_PRESETS, deviceById, type DevicePreset } from './devices.js';
import { PreviewSurface } from './PreviewSurface.js';
import { ShareDialog } from './ShareDialog.js';
import styles from './Preview.module.css';

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  fit: <Maximize2 size={14} />,
  mobile: <Smartphone size={14} />,
  tablet: <Tablet size={14} />,
  laptop: <Monitor size={14} />,
};

function DeviceSwitcher({
  device,
  onChange,
}: {
  device: DevicePreset;
  onChange: (id: string) => void;
}) {
  return (
    <div className={styles.group} role="group" aria-label="Preview size">
      {DEVICE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={[styles.tool, preset.id === device.id ? styles.toolActive : '']
            .filter(Boolean)
            .join(' ')}
          title={preset.width === null ? preset.label : `${preset.label} — ${preset.width}px wide`}
          aria-label={preset.label}
          aria-pressed={preset.id === device.id}
          onClick={() => onChange(preset.id)}
        >
          {DEVICE_ICONS[preset.id]}
        </button>
      ))}
    </div>
  );
}

/**
 * Moves between the document's pages without going back to the editor.
 *
 * The preview is addressed by page (`/preview/:projectId/:pageId`), so this is a
 * navigation rather than a piece of state — the address stays the thing that says what
 * is on screen, which is what makes it shareable. A single-page document gets plain
 * text instead: a menu with one item in it is a control that does nothing.
 */
function PageSwitcher({
  projectId,
  pages,
  current,
}: {
  projectId: string;
  pages: Page[];
  current: Page;
}) {
  const navigate = useNavigate();

  if (pages.length < 2) return <>Preview · {current.name}</>;

  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className={styles.pagePicker} title="Preview another page">
          Preview · {current.name}
          <ChevronDown size={11} strokeWidth={2} aria-hidden />
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        {pages.map((entry) => (
          <MenuCheckItem
            key={entry.id}
            checked={entry.id === current.id}
            onSelect={() => void navigate(`/preview/${projectId}/${entry.id}`)}
          >
            {entry.name}
            <span className={styles.pagePickerPath}>{entry.path}</span>
          </MenuCheckItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/**
 * The preview — PLAN.md §12, Phase 9.
 *
 * A route rather than a mode inside the editor, so that what is on screen is provably the
 * page and nothing else: there is no studio state for it to read, no selection to
 * accidentally render, and the address is shareable with anyone who has access to the
 * project. The document comes from the API rather than from the studio for the same
 * reason — this is a view of what is *saved*, which is what the export and the shared link
 * will also be built from. The editor's Preview button flushes the autosave before
 * navigating here so those are the same thing.
 */
export function PreviewRoute() {
  const { projectId, pageId } = useParams();
  const navigate = useNavigate();

  const project = useProject(projectId);

  const saved = useQuery({
    queryKey: keys.document(projectId ?? ''),
    queryFn: projectId
      ? ({ signal }: { signal: AbortSignal }) => documentsApi.getDocument(projectId, signal)
      : skipToken,
    // Never from cache. Arriving here from the editor means a save has just landed, and a
    // preview of the document as it was thirty seconds ago is worse than a short spinner.
    staleTime: 0,
  });

  const [deviceId, setDeviceId] = useState(DEVICE_PRESETS[0]?.id ?? 'fit');
  const [sharing, setSharing] = useState(false);

  if (project.isPending || saved.isPending) {
    return <ScreenLoading label="Loading preview" />;
  }

  if (project.isError || saved.isError) {
    const error = project.error ?? saved.error;
    const missing =
      error instanceof ApiError && (error.code === 'not_found' || error.code === 'forbidden');

    return (
      <ScreenMessage
        title={missing ? 'Project not available' : 'Could not load this preview'}
        message={formErrorMessage(error)}
        actions={<Button onClick={() => void navigate('/')}>Back to projects</Button>}
      />
    );
  }

  const doc = saved.data.doc;

  // A project whose document has never been saved. Not an error — it is where every
  // project starts, and the way out of it is the editor.
  if (!doc) {
    return (
      <ScreenMessage
        title="Nothing to preview yet"
        message="This project has no saved page. Open the editor and add something to it."
        actions={
          <Button onClick={() => void navigate(`/p/${project.data.id}`)}>Open the editor</Button>
        }
      />
    );
  }

  // An unknown page id falls back to the first page rather than erroring: the id comes
  // from a link that may have outlived the page it named, and the project still has pages.
  const page = doc.pages.find((candidate) => candidate.id === pageId) ?? doc.pages[0];

  if (!page) {
    return (
      <ScreenMessage
        title="This project has no pages"
        actions={
          <Button onClick={() => void navigate(`/p/${project.data.id}`)}>Open the editor</Button>
        }
      />
    );
  }

  const device = deviceById(deviceId);

  return (
    <div className={styles.screen}>
      <header className={styles.bar}>
        <Link
          to={`/p/${project.data.id}`}
          className={styles.back}
          title="Back to the editor"
          aria-label="Back to the editor"
        >
          <ChevronLeft size={16} />
        </Link>

        <div className={styles.title}>
          <span className={styles.name}>{project.data.name}</span>
          <span className={styles.meta}>
            <PageSwitcher projectId={project.data.id} pages={doc.pages} current={page} />
            {/* The version is what a shared link is measured against, so it is worth
                stating rather than leaving to the share dialog alone. */}
            {saved.data.version > 0 ? ` · v${saved.data.version}` : ''}
          </span>
        </div>

        <span className={styles.spacer} />

        <DeviceSwitcher device={device} onChange={setDeviceId} />
        <span className={styles.size}>
          {device.width === null ? 'Responsive' : `${device.width} × ${device.height}`}
        </span>

        <span className={styles.spacer} />

        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => setSharing(true)}>
            <Share2 size={14} aria-hidden="true" />
            Share
          </Button>
          <span className={styles.divider} aria-hidden="true" />
          <UserMenu />
        </div>
      </header>

      <PreviewSurface
        page={page}
        symbols={doc.symbols}
        theme={doc.theme}
        device={device}
        // A nav item in the design is a real destination here: it moves the preview to
        // the page holding that path, address and all, so the link is as shareable as
        // the one the page switcher above produces. A path no page claims does nothing —
        // there is nothing to show, and the editor is where that gets fixed.
        onOpenPath={(path) => {
          const destination = doc.pages.find((candidate) => candidate.path === path);
          if (destination) void navigate(`/preview/${project.data.id}/${destination.id}`);
        }}
      />

      <ShareDialog
        projectId={project.data.id}
        role={project.data.role}
        currentVersion={saved.data.version}
        open={sharing}
        onOpenChange={setSharing}
      />
    </div>
  );
}
