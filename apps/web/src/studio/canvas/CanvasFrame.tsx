import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The canvas iframe — PLAN.md §5.
 *
 * An iframe rather than a div because the design has to be isolated from the studio
 * in both directions: the studio's reset and tokens must not leak into the user's
 * page, and the user's CSS must not be able to restyle the editor around it. It also
 * gives the design its own viewport, which is what makes responsive breakpoints
 * testable on the canvas at all.
 *
 * React renders *through* the frame with a portal instead of the frame loading a
 * separate app: one React tree, one state, no message-passing to keep in sync.
 */
export function CanvasFrame({
  title,
  className,
  children,
  onDocument,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
  /** Called with the frame's document once it exists, and with null on teardown. */
  onDocument?: (doc: Document | null) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<Document | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    // A same-origin document that is already parsed. `srcDoc` rather than a blank
    // `src`, because about:blank fires `load` inconsistently across browsers and a
    // missed one leaves the canvas permanently empty.
    const attach = () => {
      const next = frame.contentDocument;
      if (next) setDoc(next);
    };

    if (frame.contentDocument?.readyState === 'complete') attach();
    frame.addEventListener('load', attach);
    return () => frame.removeEventListener('load', attach);
  }, []);

  useEffect(() => {
    onDocument?.(doc);
    return () => onDocument?.(null);
  }, [doc, onDocument]);

  return (
    <>
      <iframe
        ref={frameRef}
        title={title}
        className={className}
        srcDoc="<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>"
      />
      {doc?.body ? createPortal(children, doc.body) : null}
    </>
  );
}
