import type { ComponentSpec } from '../spec.js';

/** Theme space steps, not pixel values. */
export const SPACER_SIZES = ['1', '2', '3', '4', '6', '8', '12', '16'] as const;

export const SpacerSpec: ComponentSpec = {
  key: 'Spacer',
  displayName: 'Spacer',
  category: 'Layout',
  icon: 'Space',
  keywords: ['space', 'gap', 'margin', 'padding', 'push', 'fill', 'blank'],
  description: 'Empty space between two siblings.',

  props: [
    {
      name: 'size',
      label: 'Size',
      type: 'enum',
      options: SPACER_SIZES.map((value) => ({ label: value, value })),
    },
    { name: 'grow', label: 'Fill remaining space', type: 'boolean' },
  ],
  events: [],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { size: '4', grow: false },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-spacer',
      attrs: {
        'data-size': { prop: 'size', as: 'enum', options: SPACER_SIZES, fallback: '4' },
        'data-grow': { prop: 'grow', as: 'flag', on: 'true' },
        'aria-hidden': { const: true },
      },
    },
  },
};
