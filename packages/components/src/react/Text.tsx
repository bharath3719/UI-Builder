import { asEnum, asString } from '../spec.js';
import { TEXT_SIZES, TEXT_TONES } from '../specs/Text.js';
import type { RenderedProps } from './props.js';

export interface TextProps extends RenderedProps {
  text?: string;
  size?: string;
  tone?: string;
}

/**
 * A paragraph whose content is a prop rather than children.
 *
 * That is the deliberate difference from a container: text is edited in the inspector
 * (and, later, in place on the canvas), never by dropping other components inside it.
 * Making it `isVoid` is what stops a drag from trying to nest a Button in a sentence.
 */
export function Text({ text, size, tone, className, children: _children, ...rest }: TextProps) {
  return (
    <p
      className={['ub-text', className].filter(Boolean).join(' ')}
      data-size={asEnum(size, TEXT_SIZES, 'base')}
      data-tone={asEnum(tone, TEXT_TONES, 'default')}
      {...rest}
    >
      {asString(text, 'Text')}
    </p>
  );
}
