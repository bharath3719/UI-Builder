import { asBoolean, asEnum, asString } from '../spec.js';
import { INPUT_TYPES } from '../specs/Input.js';
import type { RenderedProps } from './props.js';

export interface InputProps extends RenderedProps {
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  /** Set by the canvas so a design-time input cannot be typed into. */
  readOnly?: boolean;
}

export function Input({
  placeholder,
  type,
  disabled,
  className,
  children: _children,
  ...rest
}: InputProps) {
  const isDisabled = asBoolean(disabled);

  return (
    <input
      className={['ub-input', className].filter(Boolean).join(' ')}
      type={asEnum(type, INPUT_TYPES, 'text')}
      placeholder={asString(placeholder, '')}
      data-disabled={isDisabled ? '' : undefined}
      disabled={isDisabled}
      {...rest}
    />
  );
}
