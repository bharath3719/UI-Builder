import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { REQUIRES, hasAtLeast, type Role } from '@ui-builder/schema';
import * as publishApi from '../api/publish.js';
import { keys } from '../api/queries.js';
import { formErrorMessage } from '../lib/formErrors.js';
import { Button } from '../ui/Button.js';
import { Dialog, FormError } from '../ui/Dialog.js';
import styles from './Preview.module.css';

/** How long the copy button stays confirmed before going back to offering the action. */
const COPIED_MS = 1800;

function sharedPageUrl(slug: string): string {
  return `${window.location.origin}/s/${slug}`;
}

/**
 * Publish, share, republish, unpublish — PLAN.md §12, Phase 9.
 *
 * The one idea the copy has to carry is that a link is a *snapshot*: it serves the
 * revision that was live when the button was pressed, and editing afterwards does not
 * change it. That is a feature — nobody wants a reviewer opening a half-finished redesign
 * — but only if it is said out loud, so the dialog says it, and says explicitly when the
 * link has fallen behind the document on screen.
 */
export function ShareDialog({
  projectId,
  role,
  currentVersion,
  open,
  onOpenChange,
}: {
  projectId: string;
  /** The caller's role in the owning workspace. A viewer may copy, not publish. */
  role: Role;
  /** The version the saved document is at, so a stale link can be named as one. */
  currentVersion: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const writable = hasAtLeast(role, REQUIRES.projectWrite);

  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  const state = useQuery({
    queryKey: keys.publish(projectId),
    queryFn: ({ signal }) => publishApi.getPublishState(projectId, signal),
    // Only while the dialog is open, and never from cache: someone else may have
    // published or taken the link down since it was last looked at.
    enabled: open,
    staleTime: 0,
  });

  const publish = useMutation({
    mutationFn: () => publishApi.publishProject(projectId),
    onSuccess: (summary) => {
      client.setQueryData(keys.publish(projectId), { publish: summary });
      // Publishing freezes the head revision, so the next save starts a new one — which
      // means the history list the studio is holding is now out of date.
      void client.invalidateQueries({ queryKey: keys.revisions(projectId) });
      setProblem(null);
    },
    onError: (error: unknown) => setProblem(formErrorMessage(error) ?? 'Something went wrong.'),
  });

  const unpublish = useMutation({
    mutationFn: () => publishApi.unpublishProject(projectId),
    onSuccess: () => {
      client.setQueryData(keys.publish(projectId), { publish: null });
      setProblem(null);
    },
    onError: (error: unknown) => setProblem(formErrorMessage(error) ?? 'Something went wrong.'),
  });

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const published = state.data?.publish ?? null;
  const url = published ? sharedPageUrl(published.slug) : null;
  // The link is behind what has been saved since. `<` rather than `!==` because a restore
  // moves the project forward too — the published revision is never *ahead*.
  const stale = published !== null && published.version < currentVersion;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard permission (or no clipboard API on an insecure origin). Selecting the
      // text leaves the user one keystroke from the same result, which beats an error
      // about a browser API they did not ask about.
      linkRef.current?.select();
      setProblem('Could not copy automatically — the link is selected, press Ctrl/⌘C.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setProblem(null);
        onOpenChange(next);
      }}
      title="Share this page"
      description={
        published
          ? 'Anyone with this link can open the page. They do not need an account.'
          : 'Publishing creates a link anyone can open without an account. It shows the page as it is saved right now — later edits do not change it until you publish again.'
      }
      footer={
        <>
          {published && writable && (
            <Button
              type="button"
              variant="ghost"
              disabled={unpublish.isPending}
              onClick={() => unpublish.mutate()}
            >
              {unpublish.isPending ? 'Removing…' : 'Unpublish'}
            </Button>
          )}
          <span className={styles.spacer} />
          {published ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!writable || state.isPending || publish.isPending}
                onClick={() => publish.mutate()}
              >
                {publish.isPending ? 'Publishing…' : 'Publish'}
              </Button>
            </>
          )}
        </>
      }
    >
      {state.isPending && <p className={styles.note}>Loading…</p>}

      {state.isError && (
        <FormError>{formErrorMessage(state.error) ?? 'Something failed.'}</FormError>
      )}

      {url && (
        <>
          <div className={styles.shareRow}>
            <input
              ref={linkRef}
              className={styles.link}
              value={url}
              readOnly
              aria-label="Shared link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button type="button" onClick={() => void copy()}>
              {copied ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <Copy size={13} aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          {stale && (
            <div className={styles.stale}>
              <span>This link is showing an earlier version of the page.</span>
              {writable && (
                <Button type="button" disabled={publish.isPending} onClick={() => publish.mutate()}>
                  {publish.isPending ? 'Updating…' : 'Update link'}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {!state.isPending && !published && !writable && (
        <p className={styles.note}>
          This page has not been published. Publishing needs the editor role.
        </p>
      )}

      {problem && <FormError>{problem}</FormError>}
    </Dialog>
  );
}
