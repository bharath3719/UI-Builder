import { asBoolean, asEnum, asString } from '../spec.js';
import { BUTTON_SIZES, BUTTON_VARIANTS } from '../specs/Button.js';
import type { RenderedProps } from './props.js';

export interface ButtonProps extends RenderedProps {
  text?: string;
  variant?: string;
  size?: string;
  disabled?: boolean;
}

export function Button({
  text,
  variant,
  size,
  disabled,
  className,
  children: _children,
  ...rest
}: ButtonProps) {
  const isDisabled = asBoolean(disabled);

  return (
    <button
      // Always type="button": a Button dropped inside a Form must not submit it by
      // accident, on the canvas or in the exported page.
      type="button"
      className={['ub-button', className].filter(Boolean).join(' ')}
      data-variant={asEnum(variant, BUTTON_VARIANTS, 'default')}
      data-size={asEnum(size, BUTTON_SIZES, 'default')}
      // The attribute drives the style; the property drives behaviour. Both, because
      // the canvas renders buttons it must never actually let you press.
      data-disabled={isDisabled ? '' : undefined}
      disabled={isDisabled}
      {...rest}
    >
      {asString(text, 'Button')}
    </button>
  );
}
