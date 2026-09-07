import type { RenderedProps } from './props.js';

/**
 * The unopinionated container — a `div` with nothing but the styles the user gives
 * it. Every zero-result palette search offers this, because "some element I will
 * style myself" is always a valid answer.
 */
export function Box({ className, children, ...rest }: RenderedProps) {
  return (
    <div className={['ub-box', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
