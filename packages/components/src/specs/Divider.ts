import type { ComponentSpec } from '../spec.js';

export const DIVIDER_ORIENTATIONS = ['horizontal', 'vertical'] as const;

export const DividerSpec: ComponentSpec = {
  key: 'Divider',
  displayName: 'Divider',
  category: 'Layout',
  icon: 'Minus',
  keywords: ['hr', 'rule', 'separator', 'line', 'break', 'split'],
  description: 'A line between two sections.',

  props: [
    {
      name: 'orientation',
      label: 'Orientation',
      type: 'enum',
      options: DIVIDER_ORIENTATIONS.map((value) => ({ label: value, value })),
    },
  ],
  events: [],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { orientation: 'horizontal' },
  defaultStyles: {},

  codegen: {
    tag: 'hr',
    emit: {
      tag: 'hr',
      class: 'ub-divider',
      attrs: {
        'data-orientation': {
          prop: 'orientation',
          as: 'enum',
          options: DIVIDER_ORIENTATIONS,
          fallback: 'horizontal',
        },
        'aria-orientation': {
          prop: 'orientation',
          as: 'enum',
          options: DIVIDER_ORIENTATIONS,
          fallback: 'horizontal',
        },
      },
    },
  },
};
