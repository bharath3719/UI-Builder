import { asEnum } from '../spec.js';
import { SCROLL_AXES } from '../specs/Scroll.js';
import type { RenderedProps } from './props.js';

export interface ScrollProps extends RenderedProps {
  axis?: string;
}

/**
 * A container that scrolls rather than growing past its size.
 *
 * A `Box` with `overflow` settled and the measurement left where every other measurement
 * lives — the Design tab. The scrollbar itself is the browser's: styling one is a
 * per-platform decision a design tool should not make on its author's behalf, and a rule
 * for it here would be one an exported project could not undo without knowing this
 * stylesheet exists.
 */
export function Scroll({ axis, className, children, ...rest }: ScrollProps) {
  return (
    <div
      className={['ub-scroll', className].filter(Boolean).join(' ')}
      data-axis={asEnum(axis, SCROLL_AXES, 'vertical')}
      {...rest}
    >
      {children}
    </div>
  );
}
