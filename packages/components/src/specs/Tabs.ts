import type { ComponentSpec } from '../spec.js';

export const TABS_VARIANTS = ['line', 'pill'] as const;

/**
 * A tab strip over one panel.
 *
 * The tabs are authored as text — the trade `Select`, `Radio` and `SideNav` make (§7) —
 * and the panel is this node's children. That is the shape that made `Tabs` buildable
 * without the insert-time subtree templates PLAN.md §7 parks it behind: a set of labels is
 * data, and *which one is current* is a fact about the whole set rather than about any one
 * of them, so it lives in a prop instead of being styled onto one child by hand.
 *
 * What it does not do is switch panels, and that is stated rather than hidden: one panel
 * is drawn, for the tab `active` names. Switching is an interaction (§10) — the same
 * `openOverlay`-shaped work `Modal` waits on — and a tab strip that swapped content the
 * document does not carry would show the canvas one thing and the export another.
 */
export const TabsSpec: ComponentSpec = {
  key: 'Tabs',
  displayName: 'Tabs',
  category: 'Overlay',
  icon: 'PanelsTopLeft',
  keywords: ['tabs', 'tab', 'segmented', 'switcher', 'panels', 'views', 'sections'],
  description: 'A row of tabs above a panel, authored as a list.',

  props: [
    {
      name: 'items',
      label: 'Tabs',
      type: 'text',
      placeholder: 'One per line — id | Label',
    },
    { name: 'active', label: 'Current', type: 'string', placeholder: 'overview' },
    {
      name: 'variant',
      label: 'Variant',
      type: 'enum',
      options: TABS_VARIANTS.map((value) => ({ label: value, value })),
    },
  ],
  events: ['onClick'],
  acceptsChildren: true,
  layout: 'flex',

  defaultProps: {
    items: 'overview | Overview\nactivity | Activity\nsettings | Settings',
    active: 'overview',
    variant: 'line',
  },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-tabs',
      attrs: {
        'data-variant': { prop: 'variant', as: 'enum', options: TABS_VARIANTS, fallback: 'line' },
      },
      children: [
        {
          tag: 'div',
          class: 'ub-tabs-list',
          attrs: { role: 'tablist' },
          children: [{ tabItems: { items: 'items', active: 'active' } }],
        },
        {
          tag: 'div',
          class: 'ub-tabs-panel',
          attrs: { role: 'tabpanel' },
          children: [{ slot: true }],
        },
      ],
    },
  },
};
