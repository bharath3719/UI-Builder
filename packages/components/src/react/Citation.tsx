import { asNumber, asString } from '../spec.js';
import type { RenderedProps } from './props.js';

export interface CitationProps extends RenderedProps {
  index?: number;
  label?: string;
  href?: string;
}

/**
 * A numbered reference to a source, inline in the copy.
 *
 * An anchor either way: with a link it goes somewhere, without one it is still the element
 * a reader recognises, and an `<a>` with no `href` is valid and unfocusable — so the
 * markup does not fork on whether the URL has been typed yet.
 *
 * The number is floored at one because a citation is the *nth* source; a reference
 * numbered zero reads as a fault in whatever produced the page.
 */
export function Citation({
  index,
  label,
  href,
  className,
  children: _children,
  ...rest
}: CitationProps) {
  const text = asString(label);
  const link = asString(href);

  return (
    <a
      className={['ub-citation', className].filter(Boolean).join(' ')}
      href={link === '' ? undefined : link}
      {...rest}
    >
      <span className="ub-citation-index">{Math.max(1, Math.round(asNumber(index, 1)))}</span>
      {text === '' ? null : <span className="ub-citation-label">{text}</span>}
    </a>
  );
}
