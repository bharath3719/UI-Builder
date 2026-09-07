import { asEnum, asString } from '../spec.js';
import { LINK_TARGETS, LINK_UNDERLINE } from '../specs/Link.js';
import type { RenderedProps } from './props.js';

export interface LinkProps extends RenderedProps {
  text?: string;
  href?: string;
  target?: string;
  underline?: string;
}

/**
 * An anchor whose label is a prop, for the same reason Text's is: a link is a phrase,
 * not a container to drop components into.
 *
 * `rel="noreferrer noopener"` is attached to every new-tab link rather than offered as
 * a prop — a builder should not be able to ship the tab-napping bug by forgetting a
 * checkbox. The canvas swallows clicks, so an href here never navigates the frame.
 */
export function Link({
  text,
  href,
  target,
  underline,
  className,
  children: _children,
  ...rest
}: LinkProps) {
  const newTab = asEnum(target, LINK_TARGETS, 'self') === 'blank';

  return (
    <a
      className={['ub-link', className].filter(Boolean).join(' ')}
      // '#' rather than omitting the attribute: an anchor with no href is not a link
      // at all — it drops out of the tab order and stops matching :hover styles, so a
      // half-configured link would look wrong for a reason the user cannot see.
      href={asString(href) || '#'}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noreferrer noopener' : undefined}
      data-underline={asEnum(underline, LINK_UNDERLINE, 'hover')}
      {...rest}
    >
      {asString(text, 'Link')}
    </a>
  );
}
