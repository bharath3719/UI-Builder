import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { skipToken, useQuery } from '@tanstack/react-query';
import * as publishApi from '../api/publish.js';
import { keys } from '../api/queries.js';
import { ScreenLoading, ScreenMessage } from '../ui/Screen.js';
import { DEFAULT_DEVICE } from './devices.js';
import { PreviewSurface } from './PreviewSurface.js';
import styles from './Preview.module.css';

/**
 * A shared page — PLAN.md §12, Phase 9.
 *
 * Outside `RequireAuth` on purpose: the slug is the credential, and a link that bounced a
 * logged-out visitor to a sign-in screen would not be a shared link at all. The visitor
 * may well *be* signed in; it makes no difference to what this shows.
 *
 * No chrome of any kind. Not a toolbar, not a badge, not a "made with" — the page fills
 * the window and the studio's contribution to the DOM is the div it is mounted in. The
 * design still renders inside an iframe, for the same reason as everywhere else: the
 * studio's reset and tokens must not reach it (D2).
 */
export function SharedPageRoute() {
  const { slug } = useParams();

  // Which page of the shared document is on screen. State rather than the address,
  // because the slug *is* the address here — it names the share, not a page in it — and
  // a link that changed under the visitor would no longer be the link they were sent.
  const [openId, setOpenId] = useState<string | null>(null);

  const page = useQuery({
    queryKey: keys.published(slug ?? ''),
    queryFn: slug
      ? ({ signal }: { signal: AbortSignal }) => publishApi.getPublishedPage(slug, signal)
      : skipToken,
  });

  const projectName = page.data?.projectName;

  useEffect(() => {
    if (!projectName) return;
    const previous = document.title;
    document.title = projectName;
    return () => {
      document.title = previous;
    };
  }, [projectName]);

  if (page.isPending) {
    return <ScreenLoading label="Loading page" />;
  }

  // Every failure reads the same, because every failure is the same to the visitor: the
  // link does not work. Distinguishing "unpublished" from "never existed" would tell a
  // stranger something about a project they have no access to.
  if (page.isError || !page.data.doc.pages[0]) {
    return (
      <ScreenMessage
        title="This link is not available"
        message="The page may have been unpublished, or the link may be incomplete."
      />
    );
  }

  const pages = page.data.doc.pages;
  const first = page.data.doc.pages[0];
  // The first page is what the link resolves to; a nav inside the design can move off it.
  const open = pages.find((candidate) => candidate.id === openId) ?? first;

  return (
    <div className={styles.screen}>
      <PreviewSurface
        page={open}
        symbols={page.data.doc.symbols}
        theme={page.data.doc.theme}
        device={DEFAULT_DEVICE}
        title={page.data.projectName}
        bare
        // A shared prototype with a nav in it should navigate. The whole document is
        // already here — the API hands the visitor every page of it — so this shows
        // another page rather than leaving the visitor with links that do nothing.
        onOpenPath={(path) => {
          const destination = pages.find((candidate) => candidate.path === path);
          if (destination) setOpenId(destination.id);
        }}
      />
    </div>
  );
}
