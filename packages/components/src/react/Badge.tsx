import { asEnum, asString } from '../spec.js';
import { BADGE_VARIANTS } from '../specs/Badge.js';
import type { RenderedProps } from './props.js';

export interface BadgeProps extends RenderedProps {
  text?: string;
  variant?: string;
}

/** A small status pill — a count, a state, a tag. */
export function Badge({ text, variant, className, children: _children, ...rest }: BadgeProps) {
  return (
    <span
      className={['ub-badge', className].filter(Boolean).join(' ')}
      data-variant={asEnum(variant, BADGE_VARIANTS, 'default')}
      {...rest}
    >
      {asString(text, 'Badge')}
    </span>
  );
}
