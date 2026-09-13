import type { MouseEvent } from 'react';
import { parseDisclosures } from '../derive.js';
import { asBoolean, asString } from '../spec.js';
import type { RenderedProps } from './props.js';

export interface AccordionProps extends RenderedProps {
  /** One row per line. `Title | Body` splits the two; a bare line is a title alone. */
  items?: string;
  openFirst?: boolean;
  /**
   * Supplied by the renderer while editing. The rows still draw open or shut as they will
   * ship; only the toggling is withheld, because the click that opens a row is the click
   * that selects the node.
   */
  readOnly?: boolean;
}

/**
 * Collapsible rows, authored as text.
 *
 * Each row is a native `<details>`, which is what makes this one node rather than a
 * compound component and what lets the export open and close with no JavaScript. The rows
 * come from `parseDisclosures` — the same parse `codegen` runs — so the canvas and the
 * exported page are the same markup (D6).
 */
export function Accordion({
  items,
  openFirst,
  className,
  children: _children,
  readOnly,
  ...rest
}: AccordionProps) {
  const rows = parseDisclosures(asString(items));
  const first = asBoolean(openFirst, true);

  // Design time only: without it, `open` and the DOM drift apart the moment someone
  // clicks a summary on the canvas, and React would be rendering one thing over another.
  const freeze = readOnly
    ? (event: MouseEvent) => {
        event.preventDefault();
      }
    : undefined;

  return (
    <div className={['ub-accordion', className].filter(Boolean).join(' ')} {...rest}>
      {rows.map((row, index) => (
        <details key={row.title + index} className="ub-accordion-item" open={first && index === 0}>
          <summary className="ub-accordion-summary" onClick={freeze}>
            {row.title}
          </summary>
          {row.body === '' ? null : <div className="ub-accordion-body">{row.body}</div>}
        </details>
      ))}
    </div>
  );
}
