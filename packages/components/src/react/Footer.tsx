import { asBoolean, asString } from '../spec.js';
import { NavLinks } from './NavLinks.js';
import type { RenderedProps } from './props.js';

export interface FooterProps extends RenderedProps {
  brand?: string;
  logoSrc?: string;
  /** One line about the product, under the brand. */
  tagline?: string;
  /** One link per line. `/path | Label` splits the two; a bare line is both. */
  items?: string;
  copyright?: string;
  bordered?: boolean;
}

/**
 * A page footer — brand, tagline, links and a copyright line — as one node.
 *
 * The counterpart to `Header`, and one component for the same reason: the brand block
 * and the link row sit at opposite ends of a wrapping row, with the copyright on its own
 * line beneath, and that is three rules and five nodes to assemble by hand.
 *
 * No current-page marking, unlike `SideNav` and `Header`: a footer says where a site
 * goes, not where the reader is, so `NavLinks` is given no `active` value at all.
 */
export function Footer({
  brand,
  logoSrc,
  tagline,
  items,
  copyright,
  bordered,
  className,
  children: _children,
  ...rest
}: FooterProps) {
  const name = asString(brand);
  const logo = asString(logoSrc);
  const line = asString(tagline);
  const links = asString(items);
  const legal = asString(copyright);

  return (
    <footer
      className={['ub-footer', className].filter(Boolean).join(' ')}
      data-bordered={asBoolean(bordered, true) ? '' : undefined}
      {...rest}
    >
      <div className="ub-footer-top">
        {name || logo || line ? (
          <div className="ub-footer-brand">
            {name || logo ? (
              <div className="ub-footer-mark">
                {logo ? (
                  <img className="ub-footer-logo" src={logo} alt="" draggable={false} />
                ) : null}
                {name ? <span className="ub-footer-name">{name}</span> : null}
              </div>
            ) : null}
            {line ? <p className="ub-footer-tagline">{line}</p> : null}
          </div>
        ) : null}

        {links ? (
          <nav className="ub-footer-nav">
            <NavLinks items={links} active={null} className="ub-footer-item" />
          </nav>
        ) : null}
      </div>

      {legal ? <div className="ub-footer-copyright">{legal}</div> : null}
    </footer>
  );
}
