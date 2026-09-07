import { asBoolean, asString } from '../spec.js';
import { NavLinks } from './NavLinks.js';
import type { RenderedProps } from './props.js';

export interface HeaderProps extends RenderedProps {
  /** The wordmark. Also the accessible name of the logo link. */
  brand?: string;
  /** A logo image. Absent leaves the wordmark standing on its own. */
  logoSrc?: string;
  /** Where the brand links to. */
  homeHref?: string;
  /** One link per line. `/path | Label` splits the two; a bare line is both. */
  items?: string;
  /** The `href` of the link to mark as the current page. */
  active?: string;
  /** The one action on the bar. Empty means the header has none. */
  cta?: string;
  ctaHref?: string;
  sticky?: boolean;
  bordered?: boolean;
}

/**
 * A page header — brand, links and a single action — as one node.
 *
 * One component rather than an `HStack` holding an `Image`, three `Link`s and a `Button`,
 * for the reason `ChatMessage` is one: the three groups have to stay pinned left, left
 * and right as their contents change, and that is a `margin-left: auto` on the action
 * plus a flex row someone would otherwise have to know to set. Authored by hand it is
 * six nodes and two rules; here it is a panel of fields.
 *
 * The links are text rather than child nodes, the same trade `SideNav` and `Select` make
 * (§7): a list of destinations is data, and *which one is current* is one answer about
 * the whole set rather than a style on one of them.
 *
 * The action is an anchor wearing the Button classes, not a `<button>`: a header action
 * goes somewhere, and a shipped button waiting for an `onClick` nobody wrote is a control
 * that does nothing in the exported project.
 */
export function Header({
  brand,
  logoSrc,
  homeHref,
  items,
  active,
  cta,
  ctaHref,
  sticky,
  bordered,
  className,
  children: _children,
  ...rest
}: HeaderProps) {
  const name = asString(brand);
  const logo = asString(logoSrc);
  const links = asString(items);
  const action = asString(cta);

  return (
    <header
      className={['ub-header', className].filter(Boolean).join(' ')}
      data-sticky={asBoolean(sticky) ? '' : undefined}
      data-bordered={asBoolean(bordered, true) ? '' : undefined}
      {...rest}
    >
      {/* With both the logo and the wordmark cleared there is nothing to link, and an
          empty anchor would still hold a flex gap open in the row. */}
      {name || logo ? (
        <a
          className="ub-header-brand"
          href={asString(homeHref) || '/'}
          // The label rides on the link rather than the image so a screen reader hears the
          // brand once: the wordmark beside the logo is the same word.
          aria-label={name || 'Home'}
        >
          {logo ? <img className="ub-header-logo" src={logo} alt="" draggable={false} /> : null}
          {name ? <span className="ub-header-name">{name}</span> : null}
        </a>
      ) : null}

      {links ? (
        <nav className="ub-header-nav">
          <NavLinks items={links} active={asString(active)} className="ub-header-item" />
        </nav>
      ) : null}

      {action ? (
        <a
          className="ub-button ub-header-cta"
          href={asString(ctaHref) || '#'}
          data-variant="default"
          data-size="sm"
        >
          {action}
        </a>
      ) : null}
    </header>
  );
}
