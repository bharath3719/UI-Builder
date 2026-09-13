import type { ComponentSpec } from '../spec.js';

/**
 * The trail back up, authored as a list of links.
 *
 * The fourth component to reach for `navItems`, and the one that shows why that transform
 * carries the class each anchor wears: a breadcrumb link is body text with a separator
 * drawn by CSS, where a side-nav item is a filled row. Everything else about it is
 * `SideNav`'s argument — a path is data, and *which crumb is the current page* is a fact
 * about the whole trail rather than about any one link.
 *
 * The separator is a `::before` on every crumb but the first, so no element exists for it:
 * a chevron someone can select and delete is a chevron that will be missing from one
 * breadcrumb on one page.
 */
export const BreadcrumbSpec: ComponentSpec = {
  key: 'Breadcrumb',
  displayName: 'Breadcrumb',
  category: 'Layout',
  icon: 'ChevronRight',
  keywords: ['breadcrumb', 'crumbs', 'trail', 'path', 'navigation', 'hierarchy', 'where'],
  description: 'The trail back up the hierarchy, authored as a list of links.',

  props: [
    {
      name: 'items',
      label: 'Items',
      type: 'text',
      placeholder: 'One per line — /path | Label',
    },
    { name: 'active', label: 'Current', type: 'string', placeholder: '/path' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    items: '/ | Home\n/projects | Projects\n/projects/site | Marketing site',
    active: '/projects/site',
  },
  defaultStyles: {},

  codegen: {
    tag: 'nav',
    emit: {
      tag: 'nav',
      class: 'ub-breadcrumb',
      attrs: { 'aria-label': 'Breadcrumb' },
      children: [{ navItems: { items: 'items', active: 'active', class: 'ub-breadcrumb-item' } }],
    },
  },
};
