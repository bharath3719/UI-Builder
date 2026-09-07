import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, History, RotateCcw } from 'lucide-react';
import type { RevisionSummary } from '@ui-builder/schema';
import * as documentsApi from '../../api/documents.js';
import { keys } from '../../api/queries.js';
import { formErrorMessage } from '../../lib/formErrors.js';
import { Button } from '../../ui/Button.js';
import { Dialog, FormError } from '../../ui/Dialog.js';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu.js';
import { useStudio } from '../state/context.js';
import styles from './HistoryMenu.module.css';

/**
 * "3 minutes ago" down to the day, then the date.
 *
 * A revision list is read to answer "how far back is this?", and an absolute timestamp
 * makes that arithmetic the reader's problem. Past a day the relative form stops helping
 * — "6 days ago" is not more useful than the date it happened.
 */
function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((now - then) / 1000);

  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function RevisionRow({
  revision,
  now,
  onRestore,
}: {
  revision: RevisionSummary;
  now: number;
  onRestore: (revision: RevisionSummary) => void;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowTitle}>
          {revision.label ?? `Version ${revision.version}`}
          {revision.current && <span className={styles.badge}>Current</span>}
        </span>
        <span className={styles.rowMeta}>
          {relativeTime(revision.createdAt, now)}
          {revision.authorName ? ` · ${revision.authorName}` : ''}
        </span>
      </div>

      {/* The current revision is already what is on screen, so restoring it would be a
          no-op that still wrote a row. */}
      {!revision.current && (
        <button
          type="button"
          className={styles.restore}
          onClick={() => onRestore(revision)}
          title={`Restore version ${revision.version}`}
        >
          <RotateCcw size={12} aria-hidden="true" />
          Restore
        </button>
      )}
    </div>
  );
}

/**
 * The revision list, plus the one action that creates a revision on purpose.
 *
 * Autosave already writes history on a throttle, so this panel is mostly a record rather
 * than a chore. "Save version" exists for the moment someone wants a named point to come
 * back to — before a redesign, after a review — and a labelled revision is the one thing
 * a later autosave will not overwrite.
 */
export function HistoryMenu({ projectId }: { projectId: string }) {
  const { writable, adoptDoc, persistence } = useStudio();
  const client = useQueryClient();

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<RevisionSummary | null>(null);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const revisions = useQuery({
    queryKey: keys.revisions(projectId),
    queryFn: ({ signal }) => documentsApi.listRevisions(projectId, signal),
    // Only while the panel is open: the list is stale the moment anyone saves, and
    // polling it behind a closed popover would be a request every few seconds forever.
    enabled: open,
    staleTime: 0,
  });

  const invalidate = useCallback(() => {
    void client.invalidateQueries({ queryKey: keys.revisions(projectId) });
    void client.invalidateQueries({ queryKey: keys.project(projectId) });
  }, [client, projectId]);

  const restore = useMutation({
    mutationFn: (revisionId: string) => documentsApi.restoreRevision(projectId, revisionId),
    onSuccess: (result) => {
      // The server has already stored this document, so it is adopted rather than saved
      // — sending it straight back would write a second, identical revision.
      adoptDoc(result.doc, result.version);
      setConfirming(null);
      invalidate();
    },
    onError: (error: unknown) => setProblem(formErrorMessage(error) ?? 'Something went wrong.'),
  });

  const saveVersion = useCallback(async () => {
    setProblem(null);
    try {
      await persistence.saveNow({ label: label.trim() || undefined });
      setNaming(false);
      setLabel('');
      invalidate();
    } catch (error) {
      setProblem(formErrorMessage(error) ?? 'Something went wrong.');
    }
  }, [invalidate, label, persistence]);

  // Stamped when the panel opens rather than read during a render: "3 minutes ago" only
  // has to be right for as long as the list is on screen, and a clock read while
  // rendering makes the output depend on when React happened to re-run.
  const [now, setNow] = useState(() => Date.now());

  return (
    <>
      <Menu
        open={open}
        onOpenChange={(next) => {
          if (next) setNow(Date.now());
          setOpen(next);
        }}
      >
        <MenuTrigger asChild>
          <button type="button" className={styles.trigger} title="Version history">
            <History size={14} aria-hidden="true" />
          </button>
        </MenuTrigger>

        <MenuContent align="end" className={styles.panel}>
          <div className={styles.header}>Version history</div>

          {writable && (
            <>
              <MenuItem
                icon={<BookmarkPlus size={13} />}
                onSelect={() => {
                  setProblem(null);
                  setNaming(true);
                }}
              >
                Save version…
              </MenuItem>
              <MenuSeparator />
            </>
          )}

          <div className={styles.list}>
            {revisions.isPending && <p className={styles.empty}>Loading…</p>}

            {revisions.isError && (
              <p className={styles.empty}>
                {formErrorMessage(revisions.error) ?? 'The history could not be loaded.'}
              </p>
            )}

            {revisions.data?.length === 0 && (
              <p className={styles.empty}>No versions yet. The first save creates one.</p>
            )}

            {revisions.data?.map((revision) => (
              <RevisionRow
                key={revision.id}
                revision={revision}
                now={now}
                onRestore={(target) => {
                  setProblem(null);
                  setConfirming(target);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </MenuContent>
      </Menu>

      <Dialog
        open={naming}
        onOpenChange={(next) => {
          setNaming(next);
          if (!next) setLabel('');
        }}
        title="Save a version"
        description="A named version is never overwritten by an autosave, so it stays in the history as a point to come back to."
        onSubmit={(event) => {
          event.preventDefault();
          void saveVersion();
        }}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={persistence.status === 'saving'}>
              Save version
            </Button>
          </>
        }
      >
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <input
            className={styles.input}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Before the header redesign"
            maxLength={80}
            autoFocus
          />
        </label>
        {problem && <FormError>{problem}</FormError>}
      </Dialog>

      <Dialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
        title="Restore this version?"
        description={
          confirming
            ? `The document goes back to "${confirming.label ?? `version ${confirming.version}`}". What is on screen now stays in the history, so this can be undone by restoring it.`
            : undefined
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={restore.isPending}
              onClick={() => confirming && restore.mutate(confirming.id)}
            >
              {restore.isPending ? 'Restoring…' : 'Restore'}
            </Button>
          </>
        }
      >
        {problem && <FormError>{problem}</FormError>}
      </Dialog>
    </>
  );
}
