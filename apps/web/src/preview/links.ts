import { useEffect, useRef } from 'react';
import { normalizePagePath } from '@ui-builder/schema';

/**
 * Where an in-design link points, decided from the `href` the user typed rather than
 * from the resolved URL.
 *
 * The distinction matters because the design is rendered into a `srcDoc` iframe, and a
 * `srcDoc` document inherits the *studio's* base URL: `/about` resolves to
 * `localhost:5173/about`, which is the studio and not the design. So the raw attribute
 * is the only thing that still says what the author meant.
 */
export type LinkTarget =
  | { kind: 'page'; path: string }
  | { kind: 'external'; href: string }
  | { kind: 'fragment'; id: string }
  | { kind: 'none' };

/** `mailto:`, `https:`, `tel:` — anything with a scheme leaves the design. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function classifyLink(href: string | null | undefined): LinkTarget {
  const raw = (href ?? '').trim();

  // '#' is what `Link` emits for a half-configured link (see its comment), so it is the
  // common case rather than an odd one, and it means "nowhere".
  if (raw === '' || raw === '#') return { kind: 'none' };
  if (raw.startsWith('#')) return { kind: 'fragment', id: decodeURIComponent(raw.slice(1)) };
  if (raw.startsWith('//') || SCHEME.test(raw)) return { kind: 'external', href: raw };

  // A query or hash on a page link is not something the document models, so the path is
  // the whole address. Relative and absolute are treated alike: page paths are absolute,
  // and `about` in a nav means the same page as `/about` to everyone who writes it.
  const path = raw.split(/[?#]/)[0] ?? '';
  if (path === '') return { kind: 'none' };

  return { kind: 'page', path: normalizePagePath(path) };
}

/**
 * Makes the links in a previewed design behave — PLAN.md §12, Phase 9.
 *
 * Without this, a click on a nav item navigates the *frame* to the studio's own origin
 * and loads the entire studio inside the preview, which is how a side nav ends up showing
 * a stacked editor chrome and "Page not found". The canvas never had the problem because
 * it swallows clicks outright; the preview cannot do that, since a preview where nothing
 * responds to a click is not a preview of anything.
 *
 * So every click is taken over instead — including modified and middle clicks, which
 * would otherwise open that same wrong URL in a new tab — and re-aimed at what the href
 * actually meant: another page of this document, a real external site in a new tab, or an
 * element in the design for a fragment. An href that names no page does nothing, which is
 * the truth about it: there is no such page to show.
 */
export function useDesignLinks(doc: Document | null, onOpenPath?: (path: string) => void) {
  // The handler is captured per click rather than per effect, so a caller can pass an
  // inline arrow — which the routes must, since the page list they resolve against only
  // exists after their queries have settled.
  const latest = useRef(onOpenPath);

  useEffect(() => {
    latest.current = onOpenPath;
  }, [onOpenPath]);

  useEffect(() => {
    if (!doc) return;

    const onClick = (event: Event) => {
      // `instanceof Element` is unusable here: the frame is a separate realm and its
      // nodes fail the check against this document's constructors.
      const target = event.target as { closest?: (selector: string) => Element | null } | null;
      const anchor = target?.closest?.('a[href]');
      if (!anchor) return;

      event.preventDefault();

      const link = classifyLink(anchor.getAttribute('href'));

      switch (link.kind) {
        case 'page':
          latest.current?.(link.path);
          break;
        case 'external':
          // A new tab rather than this one: the preview is a thing you are looking at,
          // and following a link out of it should not cost you the preview.
          window.open(link.href, '_blank', 'noopener,noreferrer');
          break;
        case 'fragment': {
          const anchored = link.id ? doc.getElementById(link.id) : null;
          (anchored ?? doc.body).scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
        case 'none':
          break;
      }
    };

    // A form in the design would post to the studio's origin for the same reason, and
    // land on the same broken screen.
    const swallow = (event: Event) => event.preventDefault();

    doc.addEventListener('click', onClick, true);
    doc.addEventListener('submit', swallow, true);

    return () => {
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('submit', swallow, true);
    };
  }, [doc]);
}
