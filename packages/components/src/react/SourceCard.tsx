import { asNumber, asString } from '../spec.js';
import type { RenderedProps } from './props.js';

export interface SourceCardProps extends RenderedProps {
  index?: number;
  source?: string;
  title?: string;
  snippet?: string;
  href?: string;
}

/**
 * One retrieved source, as the card under an answer.
 *
 * `Citation` given a block to itself: the whole card is the link, so the target is the
 * card's area rather than four words inside it. `source` is typed rather than pulled out
 * of the URL — that parse would have to exist here *and* in `codegen` to keep D6, and it
 * would be wrong for the cases a designer cares about: an internal wiki, a PDF, a
 * document with no URL at all.
 */
export function SourceCard({
  index,
  source,
  title,
  snippet,
  href,
  className,
  children: _children,
  ...rest
}: SourceCardProps) {
  const from = asString(source);
  const heading = asString(title);
  const quote = asString(snippet);
  const link = asString(href);

  return (
    <a
      className={['ub-source-card', className].filter(Boolean).join(' ')}
      href={link === '' ? undefined : link}
      {...rest}
    >
      <span className="ub-source-card-head">
        <span className="ub-source-card-index">{Math.max(1, Math.round(asNumber(index, 1)))}</span>
        {from === '' ? null : <span className="ub-source-card-source">{from}</span>}
      </span>
      {heading === '' ? null : <span className="ub-source-card-title">{heading}</span>}
      {quote === '' ? null : <span className="ub-source-card-snippet">{quote}</span>}
    </a>
  );
}
