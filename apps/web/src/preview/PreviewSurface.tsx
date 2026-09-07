import { useCallback, useState } from 'react';
import { PageRenderer } from '@ui-builder/runtime';
import type { Page, SymbolDef, Theme } from '@ui-builder/schema';
import { CanvasFrame } from '../studio/canvas/CanvasFrame.js';
import type { DevicePreset } from './devices.js';
import { useDesignLinks } from './links.js';
import styles from './Preview.module.css';

/**
 * The design, rendered as it will ship — PLAN.md §12, Phase 9.
 *
 * `editing` is left off, and that is the whole difference from the canvas: no `data-ub-*`
 * attributes, no empty-container placeholders, no `readOnly` on form controls, and no
 * `cell`, so the stylesheet is the complete one rather than the one capped at the
 * breakpoint being edited. Nothing about the layout changes between the two, which is what
 * makes the canvas worth trusting.
 *
 * It is still an iframe. Not for the editor's benefit — there are no overlays to align
 * here — but because the studio's own reset and tokens would otherwise be inherited by
 * the design, and because media queries have to resolve against the *device's* width. A
 * preset that only set a wrapper's width would leave `@media (min-width: 768px)` reading
 * the browser window and quietly showing the desktop layout on a phone.
 */
export function PreviewSurface({
  page,
  symbols,
  theme,
  device,
  title = 'Preview',
  bare = false,
  onOpenPath,
}: {
  page: Page;
  /** The document's reusable components, without which every instance is an unknown box. */
  symbols: readonly SymbolDef[];
  theme: Theme;
  device: DevicePreset;
  /** The iframe's accessible name. */
  title?: string;
  /** Drops the surrounding padding — the shared page is the design, edge to edge. */
  bare?: boolean;
  /**
   * A link in the design pointing at a page path. Left off, such a link does nothing —
   * the interception still happens either way, because what it prevents is the frame
   * navigating to the studio (see `useDesignLinks`).
   */
  onOpenPath?: (path: string) => void;
}) {
  const fits = device.width === null;
  const [doc, setDoc] = useState<Document | null>(null);
  const onDocument = useCallback((next: Document | null) => setDoc(next), []);

  useDesignLinks(doc, onOpenPath);

  return (
    <div className={[styles.stage, bare ? styles.stageBare : ''].filter(Boolean).join(' ')}>
      <div
        className={[styles.device, fits ? styles.deviceFit : ''].filter(Boolean).join(' ')}
        style={
          fits
            ? undefined
            : { width: device.width ?? undefined, height: device.height ?? undefined }
        }
      >
        <CanvasFrame title={title} className={styles.frame} onDocument={onDocument}>
          <PageRenderer
            page={page}
            symbols={symbols}
            theme={theme}
            realm={doc?.defaultView ?? null}
            // A `navigate` action and a click on a link are the same request, so they
            // get the same answer: the host decides what a path means, and without one
            // the frame would navigate to the studio (`useDesignLinks`).
            onNavigate={onOpenPath}
          />
        </CanvasFrame>
      </div>
    </div>
  );
}
