import type { ComponentSpec } from '../spec.js';

export const SideNavSpec: ComponentSpec = {
  key: 'SideNav',
  displayName: 'Side Nav',
  category: 'Layout',
  icon: 'PanelLeft',
  keywords: ['sidebar', 'nav', 'navigation', 'menu', 'links', 'rail', 'side', 'drawer'],
  description: 'A vertical navigation sidebar, authored as a list of links.',

  props: [
    { name: 'title', label: 'Title', type: 'string', placeholder: 'Optional heading' },
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
    title: '',
    items: '/ | Home\n/inbox | Inbox\n/reports | Reports\n/settings | Settings',
    active: '/',
  },
  // A width, because a nav that fills its parent is not a side nav — and the one
  // measurement someone would otherwise have to set before it looked like anything.
  defaultStyles: { width: 220, padding: 12 },

  codegen: {
    tag: 'nav',
    emit: {
      tag: 'nav',
      class: 'ub-side-nav',
      children: [
        {
          tag: 'div',
          class: 'ub-side-nav-title',
          when: { prop: 'title', when: 'set' },
          children: [{ text: { prop: 'title', as: 'string' } }],
        },
        // The links are a transform for the reason Radio's are: how many there are and
        // which one is current both depend on what was typed, and a static template
        // cannot describe "one of these per line".
        { navItems: { items: 'items', active: 'active', class: 'ub-side-nav-item' } },
      ],
    },
  },
};
