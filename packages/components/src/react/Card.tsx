import { asBoolean } from '../spec.js';
import type { RenderedProps } from './props.js';

export interface CardProps extends RenderedProps {
  elevated?: boolean;
}

/**
 * A bordered surface for a group of things.
 *
 * The one container that is not neutral: it paints `--card` on `--background` and owns
 * a border and a radius, so a group reads as a unit without the user styling four
 * properties by hand. It is a flex column by default because that is what a card's
 * contents almost always are — a title, some text, an action.
 *
 * `elevated` is a single boolean rather than a shadow scale. Per §8 the studio's own
 * chrome uses hairlines over shadows; the user's design is free to disagree, but the
 * default should not be a choice they have to make.
 */
export function Card({ elevated, className, children, ...rest }: CardProps) {
  return (
    <div
      className={['ub-card', className].filter(Boolean).join(' ')}
      data-elevated={asBoolean(elevated) ? 'true' : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
