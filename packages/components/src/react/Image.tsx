import { asEnum, asString } from '../spec.js';
import { IMAGE_FITS, IMAGE_PLACEHOLDER_SRC } from '../specs/Image.js';
import type { RenderedProps } from './props.js';

export interface ImageProps extends RenderedProps {
  src?: string;
  alt?: string;
  fit?: string;
}

export function Image({ src, alt, fit, className, children: _children, ...rest }: ImageProps) {
  return (
    <img
      className={['ub-image', className].filter(Boolean).join(' ')}
      src={asString(src) || IMAGE_PLACEHOLDER_SRC}
      // Empty alt is a real, meaningful value — a decorative image — so it is never
      // replaced with a default.
      alt={asString(alt, '')}
      data-fit={asEnum(fit, IMAGE_FITS, 'cover')}
      draggable={false}
      {...rest}
    />
  );
}
