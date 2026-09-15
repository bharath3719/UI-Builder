import type { EmitCondition } from '../emit.js';
import { OVERLAY } from '../runtime.js';
import type { ComponentSpec } from '../spec.js';

export const DRAWER_SIDES = ['right', 'left', 'top', 'bottom'] as const;
export const DRAWER_SIZES = ['sm', 'md', 'lg'] as const;

const HAS_HEADER: EmitCondition = {
  any: [
    { prop: 'title', when: 'set' },
    { prop: 'showClose', when: 'true', default: true },
  ],
};

/**
 * A panel anchored to one edge — `Modal`'s sibling, and the same trade.
 *
 * In flow rather than fixed, for the reason `Modal` gives: an overlay pinned to the
 * viewport is a node the canvas cannot hit-test. The stage is a flex box and `side`
 * decides which corner the panel is pushed into, so one prop moves the panel, its border
 * and which of its edges is rounded — the four things someone would otherwise set by hand
 * and re-set when they changed their mind.
 */
export const DrawerSpec: ComponentSpec = {
  key: 'Drawer',
  displayName: 'Drawer',
  category: 'Overlay',
  icon: 'PanelRight',
  keywords: ['drawer', 'sheet', 'panel', 'slide', 'off-canvas', 'overlay', 'side', 'tray'],
  description: 'A panel anchored to one edge, over a dimmed backdrop.',

  props: [
    { name: 'open', label: 'Open', type: 'boolean' },
    { name: 'title', label: 'Title', type: 'string', placeholder: 'Filters' },
    {
      name: 'side',
      label: 'Side',
      type: 'enum',
      options: DRAWER_SIDES.map((value) => ({ label: value, value })),
    },
    {
      name: 'size',
      label: 'Size',
      type: 'enum',
      options: DRAWER_SIZES.map((value) => ({ label: value, value })),
    },
    { name: 'showClose', label: 'Close button', type: 'boolean' },
    { name: 'dismissable', label: 'Close on backdrop / Esc', type: 'boolean' },
    { name: 'dim', label: 'Dim behind', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: true,
  layout: 'flex',
  overlay: true,

  defaultProps: {
    open: true,
    title: 'Filters',
    side: 'right',
    size: 'md',
    showClose: true,
    dismissable: true,
    dim: true,
  },
  // A height, for `SideNav`'s reason: a drawer that is only as tall as its contents is a
  // card sitting against an edge, and the measurement is the one thing someone would have
  // to set before it looked like anything at all.
  defaultStyles: { minHeight: 360 },

  codegen: {
    tag: 'div',
    emit: {
      // See `Modal`: the module draws this div, and every element inside it still comes
      // from this template.
      from: OVERLAY,
      tag: 'div',
      class: 'ub-drawer',
      attrs: {
        'data-side': { prop: 'side', as: 'enum', options: DRAWER_SIDES, fallback: 'right' },
        'data-size': { prop: 'size', as: 'enum', options: DRAWER_SIZES, fallback: 'md' },
        'data-dim': { prop: 'dim', as: 'flag', on: '', default: true },
        'data-dismissable': { prop: 'dismissable', as: 'flag', on: '', default: true },
      },
      children: [
        {
          when: { prop: 'dim', when: 'true', default: true },
          tag: 'div',
          class: 'ub-drawer-backdrop',
          attrs: {
            'aria-hidden': 'true',
            'data-close': { prop: 'dismissable', as: 'flag', on: '', default: true },
          },
        },
        {
          tag: 'div',
          class: 'ub-drawer-panel',
          attrs: { role: 'dialog', 'aria-modal': 'true' },
          children: [
            {
              when: HAS_HEADER,
              tag: 'div',
              class: 'ub-drawer-header',
              children: [
                {
                  when: { prop: 'title', when: 'set' },
                  tag: 'h2',
                  class: 'ub-drawer-title',
                  children: [{ text: { prop: 'title', as: 'string' } }],
                },
                {
                  when: { prop: 'showClose', when: 'true', default: true },
                  tag: 'button',
                  class: 'ub-drawer-close',
                  attrs: { type: 'button', 'aria-label': 'Close', 'data-close': '' },
                  children: [{ text: { const: '×' } }],
                },
              ],
            },
            { tag: 'div', class: 'ub-drawer-body', children: [{ slot: true }] },
          ],
        },
      ],
    },
  },
};
