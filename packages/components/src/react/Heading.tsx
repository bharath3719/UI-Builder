import { asEnum, asString } from '../spec.js';
import { HEADING_LEVELS } from '../specs/Heading.js';
import type { RenderedProps } from './props.js';

export interface HeadingProps extends RenderedProps {
  text?: string;
  level?: string;
}

/**
 * `level` decides the tag — `h1`–`h4` — not just the size. A heading that looks like an
 * h2 but exports as a div is the kind of thing a builder should make impossible rather
 * than merely discourage.
 */
export function Heading({ text, level, className, children: _children, ...rest }: HeadingProps) {
  const resolved = asEnum(level, HEADING_LEVELS, '2');
  const Tag = `h${resolved}` as 'h1' | 'h2' | 'h3' | 'h4';

  return (
    <Tag
      className={['ub-heading', className].filter(Boolean).join(' ')}
      data-level={resolved}
      {...rest}
    >
      {asString(text, 'Heading')}
    </Tag>
  );
}
