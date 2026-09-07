import type { CSSProperties } from 'react';
import { asBoolean, asEnum } from '../spec.js';
import { STACK_ALIGN, STACK_JUSTIFY } from '../specs/Stack.js';
import { GAP_STEPS } from '../specs/steps.js';
import type { RenderedProps } from './props.js';

export interface StackProps extends RenderedProps {
  direction?: 'vertical' | 'horizontal';
  /** A theme space step ('4'), not a pixel value. */
  gap?: string;
  align?: string;
  justify?: string;
  wrap?: boolean;
  style?: CSSProperties;
}

/**
 * The two components a builder reaches for more than all the others combined.
 *
 * It renders as an attribute matched by a rule in the library sheet, not as an inline
 * style — an inline style beats every stylesheet, so a `gap` written in the
 * inspector's Design tab could never take effect on the one component people set gap
 * on most. Attribute rules lose to the per-node rules that come later in the sheet,
 * which is the ordering the whole style system depends on.
 *
 * Props are coerced here rather than trusted: they arrive from a stored document that
 * can be older than this file, and an unknown `align` must render as the default
 * rather than as a missing attribute selector.
 */
export function Stack({
  direction = 'vertical',
  gap,
  align,
  justify,
  wrap,
  className,
  children,
  style,
  ...rest
}: StackProps) {
  return (
    <div
      className={['ub-stack', className].filter(Boolean).join(' ')}
      data-direction={direction}
      data-gap={asEnum(gap, GAP_STEPS, '4')}
      data-align={asEnum(align, STACK_ALIGN, 'stretch')}
      data-justify={asEnum(justify, STACK_JUSTIFY, 'start')}
      data-wrap={asBoolean(wrap) ? 'true' : undefined}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Two palette entries, one implementation — see `specs/Stack.ts` for why. */
export const VStack = (props: StackProps) => <Stack {...props} direction="vertical" />;
export const HStack = (props: StackProps) => <Stack {...props} direction="horizontal" />;
