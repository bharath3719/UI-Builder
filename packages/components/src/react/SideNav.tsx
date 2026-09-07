import { asString } from '../spec.js';
import { NavLinks } from './NavLinks.js';
import type { RenderedProps } from './props.js';

export interface SideNavProps extends RenderedProps {
  /** An optional heading above the links. */
  title?: string;
  /** One link per line. `/path | Label` splits the two; a bare line is both. */
  items?: string;
  /** The `href` of the link to mark as the current page. */
  active?: string;
}

/**
 * A vertical navigation sidebar, as one node.
 *
 * The links are authored as text rather than assembled from child nodes, the same trade
 * `Select` and `Radio` make: a list of destinations is data. It is also what makes the
 * *current* item expressible at all — "which of these is the page we are on" is one
 * answer about the whole set, and a user building the nav out of separate Link nodes
 * would have to style one of them by hand and re-do it on every page.
 *
 * The links themselves are `NavLinks`, shared with `Header` and `Footer` — real anchors
 * with real `href`s, so the exported project navigates without anything being wired up.
 */
export function SideNav({
  title,
  items,
  active,
  className,
  children: _children,
  ...rest
}: SideNavProps) {
  const heading = asString(title);

  return (
    <nav className={['ub-side-nav', className].filter(Boolean).join(' ')} {...rest}>
      {heading ? <div className="ub-side-nav-title">{heading}</div> : null}
      <NavLinks items={asString(items)} active={asString(active)} className="ub-side-nav-item" />
    </nav>
  );
}
