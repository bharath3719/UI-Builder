import { parseOptions } from '../derive.js';

export interface NavLinksProps {
  /** One link per line. `/path | Label` splits the two; a bare line is both. */
  items: string;
  /**
   * The `href` to mark as the current page, or `null` for a list that has none.
   *
   * `null` rather than `''` because a line of ` | Home` parses to an empty value, and an
   * empty string would then quietly mark it as the current page.
   */
  active: string | null;
  /** The class each anchor carries — `SideNav`, `Header` and `Footer` look nothing alike. */
  className: string;
}

/**
 * A newline-authored link list, rendered as real anchors — the React half of the
 * `navItems` emit transform, and the reason three components can share one.
 *
 * Real `href`s, so the exported project navigates without anything being wired up and a
 * keyboard reaches every item. On the canvas the frame swallows clicks, which is what
 * stops one of them navigating the design away.
 *
 * A component rather than a helper that returns an array: the studio builds with React's
 * compiler lint on, which reads a function call that produces elements as a component
 * created during render.
 */
export function NavLinks({ items, active, className }: NavLinksProps) {
  return (
    <>
      {parseOptions(items).map((item) => {
        const isCurrent = item.value === active;
        return (
          <a
            key={item.value}
            className={className}
            href={item.value}
            data-active={isCurrent ? '' : undefined}
            aria-current={isCurrent ? 'page' : undefined}
          >
            {item.label}
          </a>
        );
      })}
    </>
  );
}
