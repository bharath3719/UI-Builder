import { asBoolean, asString } from '../spec.js';
import type { RenderedProps } from './props.js';

export interface TypingIndicatorProps extends RenderedProps {
  label?: string;
  bubble?: boolean;
}

/**
 * The three dots that stand in for a reply that has not arrived yet.
 *
 * `bubble` makes it sit in the same shape a `ChatMessage` does, which is where it
 * almost always goes — a pending turn at the bottom of the thread. Off, it is a bare
 * inline run of dots for a toolbar or a caption.
 *
 * `role="status"` rather than a decorative span: "the assistant is composing" is real
 * information, and it is the only thing on screen saying so. The dots themselves are
 * `aria-hidden` so a screen reader announces the label instead of three empty spans.
 *
 * The animation is CSS, not state — it has to run identically on the canvas, in the
 * preview and in the export, none of which mount the same React tree.
 */
export function TypingIndicator({
  label,
  bubble,
  className,
  children: _children,
  ...rest
}: TypingIndicatorProps) {
  const text = asString(label);

  return (
    <span
      className={['ub-typing-indicator', className].filter(Boolean).join(' ')}
      data-bubble={asBoolean(bubble) ? 'true' : undefined}
      role="status"
      {...rest}
    >
      <span className="ub-typing-dots" aria-hidden="true">
        <span className="ub-typing-dot" />
        <span className="ub-typing-dot" />
        <span className="ub-typing-dot" />
      </span>
      {text === '' ? null : <span className="ub-typing-label">{text}</span>}
    </span>
  );
}
