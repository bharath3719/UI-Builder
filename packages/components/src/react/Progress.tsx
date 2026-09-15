import { asBoolean, asNumber, asString } from '../spec.js';
import type { RenderedProps } from './props.js';

export interface ProgressProps extends RenderedProps {
  value?: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  /**
   * Supplied by the renderer while editing, because the spec declares a `value` prop. A
   * `<progress>` is not a control — there is nothing to freeze — so it is swallowed here
   * rather than spread onto an element that has no use for it.
   */
  readOnly?: boolean;
}

/**
 * How far along something is.
 *
 * A native `<progress>`, the same trade `DatePicker` makes: the browser owns this control,
 * announces it correctly without an `aria-` prop being typed, and the styling is
 * pseudo-elements rather than a div pretending to be a bar.
 *
 * The read-out is `value / max` because dividing is arithmetic the emit templates
 * deliberately cannot do (`emit.ts`), and because "3 / 7" is the honest reading of a bar
 * that counts steps. A design that wants a percentage writes one in the label.
 */
export function Progress({
  value,
  max,
  label,
  showValue,
  className,
  children: _children,
  readOnly: _readOnly,
  ...rest
}: ProgressProps) {
  const amount = Math.max(0, Math.round(asNumber(value, 0)));
  const total = Math.max(1, Math.round(asNumber(max, 100)));
  const name = asString(label);
  const shown = asBoolean(showValue, true);

  return (
    <div className={['ub-progress', className].filter(Boolean).join(' ')} {...rest}>
      {name === '' && !shown ? null : (
        <div className="ub-progress-head">
          {name === '' ? null : <span className="ub-progress-label">{name}</span>}
          {shown ? (
            <span className="ub-progress-value">
              {amount} / {total}
            </span>
          ) : null}
        </div>
      )}
      <progress className="ub-progress-bar" value={amount} max={total} />
    </div>
  );
}
