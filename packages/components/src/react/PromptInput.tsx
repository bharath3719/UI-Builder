import { asBoolean, asString } from '../spec.js';
import { valueBinding, type RenderedProps } from './props.js';

export interface PromptInputProps extends RenderedProps {
  placeholder?: string;
  value?: string;
  buttonLabel?: string;
  hint?: string;
  disabled?: boolean;
  /** Supplied by the renderer because this component stores a `value`. */
  readOnly?: boolean;
}

/**
 * The composer at the bottom of a chat — a growing text field, a hint, and a send
 * button, as one node.
 *
 * A `Textarea` next to a `Button` is not the same component: the surface a user sees is
 * the *wrapper*, which owns the border, the radius and the focus ring, while the field
 * inside it is borderless and the button sits on the same painted card. Built from two
 * nodes, that illusion takes a container, a border removed by hand, and a focus style
 * the style system cannot express across siblings.
 *
 * `value` is a design-time string with no `onChange`, bound the same way as
 * `Checkbox.checked`: controlled on the canvas, `defaultValue` in the preview and the
 * export, where someone should be able to type into the composer. This component is not
 * in the `Form` category, so what makes the renderer supply the editing-mode `readOnly`
 * is the `value` prop rather than the category — see `isDesignTimeControl`.
 *
 * `hint` renders its span even when empty because the footer is `space-between`: drop
 * the element and the button jumps to the left edge the moment someone clears the text.
 */
export function PromptInput({
  placeholder,
  value,
  buttonLabel,
  hint,
  disabled,
  className,
  children: _children,
  readOnly,
  ...rest
}: PromptInputProps) {
  const isDisabled = asBoolean(disabled);

  return (
    <div
      className={['ub-prompt-input', className].filter(Boolean).join(' ')}
      data-disabled={isDisabled ? '' : undefined}
      {...rest}
    >
      <textarea
        className="ub-prompt-input-field"
        rows={2}
        {...valueBinding(asString(value), readOnly)}
        placeholder={asString(placeholder, 'Ask anything…')}
        disabled={isDisabled}
      />
      <div className="ub-prompt-input-footer">
        <span className="ub-prompt-input-hint">{asString(hint)}</span>
        <button type="button" className="ub-prompt-input-send" disabled={isDisabled}>
          {asString(buttonLabel, 'Send')}
        </button>
      </div>
    </div>
  );
}
