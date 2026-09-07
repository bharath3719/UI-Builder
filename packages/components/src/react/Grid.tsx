import type { CSSProperties } from 'react';
import { asEnum } from '../spec.js';
import { GRID_COLUMNS } from '../specs/Grid.js';
import { GAP_STEPS } from '../specs/steps.js';
import type { RenderedProps } from './props.js';

export interface GridProps extends RenderedProps {
  /** A column count, or 'auto' to fit as many 200px tracks as the width allows. */
  columns?: string;
  /** A theme space step ('4'), not a pixel value — same contract as Stack. */
  gap?: string;
  style?: CSSProperties;
}

/**
 * The third container, after the two stacks: rows that have to line up in columns.
 *
 * Tracks are `minmax(0, 1fr)` rather than `1fr` because a grid item's default
 * `min-width: auto` lets a long word push its track wider than its share — the classic
 * "one card is bigger than the others" bug, which a builder would have no way to
 * diagnose from the inspector.
 *
 * `auto` is the responsive case without breakpoints: it is what someone dropping a
 * card gallery means, and it keeps working when the canvas viewport changes.
 */
export function Grid({ columns, gap, className, children, style, ...rest }: GridProps) {
  return (
    <div
      className={['ub-grid', className].filter(Boolean).join(' ')}
      data-columns={asEnum(columns, GRID_COLUMNS, '2')}
      data-gap={asEnum(gap, GAP_STEPS, '4')}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}
