import { asBoolean, asEnum } from '../spec.js';
import { SPACER_SIZES } from '../specs/Spacer.js';
import type { RenderedProps } from './props.js';

export interface SpacerProps extends RenderedProps {
  /** A theme space step ('4'), not a pixel value. */
  size?: string;
  /** Eat the leftover room instead — what pushes a nav's last item to the right. */
  grow?: boolean;
}

/**
 * Deliberate empty space between two siblings.
 *
 * The size is a `flex-basis`, not a width or a height, so one component works in a
 * vertical stack and a horizontal one without the user picking an axis — flex-basis is
 * always the main axis, whichever that is. A matching `min-height` is what keeps it
 * from vanishing when it is dropped into a plain Box, where there is no flex layout to
 * resolve a basis against and an invisible node would be impossible to select.
 *
 * `aria-hidden` because it is layout, not content: a screen reader announcing "blank"
 * between two sections is noise.
 */
export function Spacer({ size, grow, className, children: _children, ...rest }: SpacerProps) {
  return (
    <div
      className={['ub-spacer', className].filter(Boolean).join(' ')}
      data-size={asEnum(size, SPACER_SIZES, '4')}
      data-grow={asBoolean(grow) ? 'true' : undefined}
      aria-hidden
      {...rest}
    />
  );
}
