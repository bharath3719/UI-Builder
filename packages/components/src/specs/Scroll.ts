import type { ComponentSpec } from '../spec.js';

export const SCROLL_AXES = ['vertical', 'horizontal', 'both'] as const;

/**
 * A container that scrolls instead of growing — the last of PLAN.md §7's Layout row.
 *
 * It is a `Box` with one thing settled: `overflow` and the measurement that makes it mean
 * anything. That measurement is a *style* (`maxHeight` in the defaults, editable in the
 * Design tab) rather than a prop, because it is a size like every other size — a prop
 * would be a second place to set a height, and the two would disagree.
 *
 * The scrollbar is left to the browser. A styled one is a per-platform decision a design
 * tool should not make on its author's behalf, and `::-webkit-scrollbar` in this sheet
 * would be a rule an exported project could not undo without knowing this file exists.
 */
export const ScrollSpec: ComponentSpec = {
  key: 'Scroll',
  displayName: 'Scroll Area',
  category: 'Layout',
  icon: 'MoveVertical',
  keywords: ['scroll', 'overflow', 'area', 'pane', 'clip', 'viewport', 'fixed height'],
  description: 'A container that scrolls rather than growing past its size.',

  props: [
    {
      name: 'axis',
      label: 'Scrolls',
      type: 'enum',
      options: SCROLL_AXES.map((value) => ({ label: value, value })),
    },
  ],
  events: ['onClick'],
  acceptsChildren: true,
  layout: 'flex',

  defaultProps: { axis: 'vertical' },
  // The height is what makes a scroll area one; without it the container grows and the
  // overflow rule never has anything to do.
  defaultStyles: { maxHeight: 240, padding: 12 },

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-scroll',
      attrs: {
        'data-axis': { prop: 'axis', as: 'enum', options: SCROLL_AXES, fallback: 'vertical' },
      },
      children: [{ slot: true }],
    },
  },
};
