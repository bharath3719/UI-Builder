import { asBoolean, asNumber, asString } from '../spec.js';
import type { RenderedProps } from './props.js';

export interface TextareaProps extends RenderedProps {
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

/**
 * Input's multi-line sibling.
 *
 * `rows` sets the initial height in lines rather than pixels, because that is the unit
 * the content is measured in — a box sized to hold three lines keeps holding three
 * lines when the font scale changes. A height typed into the inspector still overrides
 * it, since the node's own styles are applied by a later rule.
 */
export function Textarea({
  placeholder,
  rows,
  disabled,
  className,
  children: _children,
  ...rest
}: TextareaProps) {
  const isDisabled = asBoolean(disabled);

  return (
    <textarea
      className={['ub-textarea', className].filter(Boolean).join(' ')}
      // A stored document can carry 0 or -1 from a hand-edited file; the browser would
      // silently fall back to 2, which is not what the inspector would be showing.
      rows={Math.max(1, Math.round(asNumber(rows, 3)))}
      placeholder={asString(placeholder, '')}
      data-disabled={isDisabled ? '' : undefined}
      disabled={isDisabled}
      {...rest}
    />
  );
}
