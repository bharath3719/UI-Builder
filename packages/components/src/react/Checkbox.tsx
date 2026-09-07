import { asBoolean, asString } from '../spec.js';
import { checkedBinding, type RenderedProps } from './props.js';

export interface CheckboxProps extends RenderedProps {
  label?: string;
  checked?: boolean;
  disabled?: boolean;
  /** Supplied by the renderer for Form components; it belongs on the control. */
  readOnly?: boolean;
}

/**
 * A checkbox and its label, as one node.
 *
 * The label is a prop and the `<label>` is the root, so clicking the word toggles the
 * box — the accessible pairing a user would otherwise have to build out of two nodes
 * and an id they cannot see. `codegen.tag` is the label for the same reason.
 *
 * `checked` is a design-time state on the canvas — controlled with no `onChange`, so
 * changing it in the inspector shows immediately, with `readOnly` making that legal
 * rather than a React warning — and `defaultChecked` in the preview and the export,
 * where the box is the user's to tick. `checkedBinding` is that switch, and the
 * renderer's editing-mode `readOnly` is what throws it.
 */
export function Checkbox({
  label,
  checked,
  disabled,
  className,
  children: _children,
  readOnly,
  ...rest
}: CheckboxProps) {
  const isDisabled = asBoolean(disabled);

  return (
    <label
      className={['ub-checkbox', className].filter(Boolean).join(' ')}
      data-disabled={isDisabled ? '' : undefined}
      {...rest}
    >
      <input
        type="checkbox"
        className="ub-checkbox-input"
        {...checkedBinding(asBoolean(checked), readOnly)}
        disabled={isDisabled}
      />
      <span className="ub-checkbox-label">{asString(label, 'Checkbox')}</span>
    </label>
  );
}
