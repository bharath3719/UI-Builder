import { asBoolean, asEnum, asString } from '../spec.js';
import { ALERT_VARIANTS } from '../specs/Alert.js';
import type { RenderedProps } from './props.js';

export interface AlertProps extends RenderedProps {
  variant?: string;
  title?: string;
  text?: string;
  showIcon?: boolean;
}

/**
 * A callout for something the reader should notice.
 *
 * The icon is an empty span the stylesheet fills, so one piece of markup covers all four
 * variants and the export still ships no icon set. `role="note"` rather than `alert`: an
 * `alert` interrupts a screen reader mid-sentence, which is right for something that just
 * happened and wrong for a banner that was on the page when it loaded.
 */
export function Alert({
  variant,
  title,
  text,
  showIcon,
  className,
  children: _children,
  ...rest
}: AlertProps) {
  const heading = asString(title);
  const body = asString(text);

  return (
    <div
      className={['ub-alert', className].filter(Boolean).join(' ')}
      role="note"
      data-variant={asEnum(variant, ALERT_VARIANTS, 'info')}
      {...rest}
    >
      {asBoolean(showIcon, true) ? <span className="ub-alert-icon" aria-hidden="true" /> : null}
      <div className="ub-alert-body">
        {heading === '' ? null : <span className="ub-alert-title">{heading}</span>}
        {body === '' ? null : <span className="ub-alert-text">{body}</span>}
      </div>
    </div>
  );
}
