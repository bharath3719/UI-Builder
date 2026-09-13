import { asString } from '../spec.js';
import { NavLinks } from './NavLinks.js';
import type { RenderedProps } from './props.js';

export interface BreadcrumbProps extends RenderedProps {
  /** One crumb per line. `/path | Label` splits the two; a bare line is both. */
  items?: string;
  /** The `href` of the crumb that is the current page. */
  active?: string;
}

/**
 * The trail back up, as one node.
 *
 * The fourth component to share `NavLinks` with `SideNav`, `Header` and `Footer`: real
 * anchors with real `href`s, so the exported page navigates with nothing wired up. The
 * separator between crumbs is drawn by the stylesheet rather than emitted, so there is no
 * chevron anyone can select, restyle or delete out of one breadcrumb on one page.
 */
export function Breadcrumb({
  items,
  active,
  className,
  children: _children,
  ...rest
}: BreadcrumbProps) {
  return (
    <nav
      className={['ub-breadcrumb', className].filter(Boolean).join(' ')}
      aria-label="Breadcrumb"
      {...rest}
    >
      <NavLinks items={asString(items)} active={asString(active)} className="ub-breadcrumb-item" />
    </nav>
  );
}
