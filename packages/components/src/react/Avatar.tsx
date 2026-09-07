import { initialsOf } from '../derive.js';
import { asEnum, asString } from '../spec.js';
import { AVATAR_SIZES } from '../specs/Avatar.js';
import type { RenderedProps } from './props.js';

export interface AvatarProps extends RenderedProps {
  src?: string;
  alt?: string;
  /** A name or initials, shown when there is no image. */
  fallback?: string;
  size?: string;
}

/**
 * A person, as a circle.
 *
 * One node with two renderings rather than shadcn's `Avatar`/`AvatarImage`/
 * `AvatarFallback` trio: the fallback is not a slot the user fills, it is what an
 * avatar shows before its image exists, which on a canvas is most of the time. The
 * wrapper is what carries the size and the circle, so the fallback lines up with the
 * image it replaces instead of being a differently-shaped hole in the layout.
 */
export function Avatar({
  src,
  alt,
  fallback,
  size,
  className,
  children: _children,
  ...rest
}: AvatarProps) {
  const source = asString(src);
  const name = asString(fallback);

  return (
    <span
      className={['ub-avatar', className].filter(Boolean).join(' ')}
      data-size={asEnum(size, AVATAR_SIZES, 'default')}
      {...rest}
    >
      {source ? (
        <img className="ub-avatar-image" src={source} alt={asString(alt, '')} draggable={false} />
      ) : (
        // The initials are decorative once `alt` is empty by design, but the name is
        // still the only text here, so it is left readable rather than hidden.
        <span className="ub-avatar-fallback">{initialsOf(name)}</span>
      )}
    </span>
  );
}
