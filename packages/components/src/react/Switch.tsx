import { asBoolean, asString } from '../spec.js';
import { checkedBinding, type RenderedProps } from './props.js';

export interface SwitchProps extends RenderedProps {
  label?: string;
  checked?: boolean;
  disabled?: boolean;
  /** Supplied by the renderer for Form components; it belongs on the control. */
  readOnly?: boolean;
}

/**
 * A checkbox drawn as a track and a thumb — the same semantics, a different promise:
 * a switch takes effect at once, a checkbox takes effect when the form is submitted.
 *
 * It is still a real `<input type="checkbox">` with `role="switch"`, styled with
 * `appearance: none` and a `::before` thumb, rather than a div listening for clicks.
 * That is what keeps the space bar, the focus ring and the label association working
 * without this component reimplementing any of them.
 *
 * See Checkbox for why `checked` is controlled on the canvas and uncontrolled elsewhere.
 */
export function Switch({
  label,
  checked,
  disabled,
  className,
  children: _children,
  readOnly,
  ...rest
}: SwitchProps) {
  const isDisabled = asBoolean(disabled);
  const text = asString(label, '');

  return (
    <label
      className={['ub-switch', className].filter(Boolean).join(' ')}
      data-disabled={isDisabled ? '' : undefined}
      {...rest}
    >
      <input
        type="checkbox"
        role="switch"
        className="ub-switch-input"
        {...checkedBinding(asBoolean(checked), readOnly)}
        disabled={isDisabled}
      />
      {/* An empty label is a real choice — a bare switch in a settings row — so the
          span is dropped rather than rendered as a gap the user has to explain. */}
      {text ? <span className="ub-switch-label">{text}</span> : null}
    </label>
  );
}
