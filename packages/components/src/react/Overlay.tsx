/**
 * The canvas-side copy of the `OVERLAY` runtime module.
 *
 * Its twin is the string in `../runtime.ts`, which is what ships into an export, and
 * `runtime.test.ts` asserts the two are the same file from the first import down. Only the
 * comment above this line differs — see that test for why.
 */

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

export interface OverlayProps {
  /** Whether the overlay is on screen at all. */
  open?: boolean;
  /** Dismissal: the close button, the backdrop, or Escape. */
  onClose?: () => void;
  className?: string;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  [attribute: string]: unknown;
}

/**
 * A dialog stage that can be opened and closed.
 *
 * It renders no markup of its own: the element it draws is the one the page asked for,
 * carrying the class and the attributes it was given, and everything inside it — the
 * backdrop, the panel, the header, the body — is passed in as children. So what a modal
 * looks like is a matter of editing the page that uses it, and nothing in this file knows
 * what a modal contains.
 *
 * What it adds is the three things a dialog does that markup cannot. It is absent from the
 * document while closed, rather than hidden, so nothing inside it is focusable or read out.
 * It takes focus when it opens — and only when it *opens*, so a panel that is simply on the
 * page does not steal the caret on load. And it closes: a click on anything marked
 * data-close (the close button, and the backdrop when the panel may be dismissed), or
 * Escape while the panel may be dismissed.
 */
export function Overlay({
  open = true,
  onClose,
  className,
  children,
  onClick,
  onKeyDown,
  ...rest
}: OverlayProps) {
  const stage = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open && !wasOpen.current) stage.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (!open) return null;

  // Whether Escape and a click on the backdrop mean anything. Read off the attribute the
  // template already writes rather than taken as a prop of its own, so the answer is in
  // the markup both renderings share instead of in two places that pass it along.
  const dismissable = rest['data-dismissable'] !== undefined;

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    // Duck-typed rather than an instanceof check: on the canvas this renders inside an
    // iframe, which has its own Element constructor, and instanceof would be false for
    // every node in it.
    if (target && typeof (target as Element).closest === 'function') {
      if ((target as Element).closest('[data-close]')) onClose?.();
    }
    onClick?.(event);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && dismissable) {
      // Stopped, so one Escape closes one dialog rather than every dialog it is inside.
      event.stopPropagation();
      onClose?.();
    }
    onKeyDown?.(event);
  }

  return (
    <div
      ref={stage}
      className={className}
      // Focusable only as a target, never in the tab order: the stage is where Escape is
      // listened for, not a stop on the way to the panel's own controls.
      tabIndex={-1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}
