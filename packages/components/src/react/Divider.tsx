import { asEnum } from '../spec.js';
import { DIVIDER_ORIENTATIONS } from '../specs/Divider.js';
import type { RenderedProps } from './props.js';

export interface DividerProps extends RenderedProps {
  orientation?: string;
}

/**
 * A rule between two sections.
 *
 * An `hr` rather than a styled div even when it is vertical: the element is what says
 * "thematic break" to a screen reader, and orientation is presentation. The border is
 * removed and the line drawn with `background` so a single declaration sets its colour
 * whichever way it is turned.
 */
export function Divider({ orientation, className, children: _children, ...rest }: DividerProps) {
  const resolved = asEnum(orientation, DIVIDER_ORIENTATIONS, 'horizontal');

  return (
    <hr
      className={['ub-divider', className].filter(Boolean).join(' ')}
      data-orientation={resolved}
      aria-orientation={resolved}
      {...rest}
    />
  );
}
