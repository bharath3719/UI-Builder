import { asBoolean, asEnum, asString } from '../spec.js';
import { DATE_KINDS } from '../specs/DatePicker.js';
import { valueBinding, type RenderedProps } from './props.js';

export interface DatePickerProps extends RenderedProps {
  kind?: string;
  value?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Supplied by the renderer for Form components; it belongs on the control. */
  readOnly?: boolean;
}

/**
 * The native date input, styled to match `Input`.
 *
 * Native rather than a calendar popover, for the reason `Select` is a native `<select>`:
 * it is one node, so it is insertable today; it exports as an element with no
 * JavaScript behind it; and it brings the platform's keyboard handling, locale-aware
 * display and mobile pickers for free. A custom calendar is a popover — an overlay with
 * open state — and overlays are the batch PLAN.md §7 defers behind subtree templates.
 * When one lands it can replace this without a stored document changing, because the
 * value already lives in a prop rather than in child nodes.
 *
 * `value` is controlled with `readOnly` on the canvas and uncontrolled everywhere else
 * (`valueBinding`), so that typing a date into the inspector shows at once while the
 * preview and the export get a field whose picker actually opens — a `readOnly` date
 * input refuses to show its calendar at all. Checkbox makes the same trade.
 */
export function DatePicker({
  kind,
  value,
  min,
  max,
  disabled,
  className,
  children: _children,
  readOnly,
  ...rest
}: DatePickerProps) {
  const isDisabled = asBoolean(disabled);

  return (
    <input
      className={['ub-date', className].filter(Boolean).join(' ')}
      type={asEnum(kind, DATE_KINDS, 'date')}
      {...valueBinding(asString(value), readOnly)}
      min={asString(min) || undefined}
      max={asString(max) || undefined}
      disabled={isDisabled}
      data-disabled={isDisabled ? '' : undefined}
      {...rest}
    />
  );
}
