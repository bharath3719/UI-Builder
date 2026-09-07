import type { ComponentSpec } from '../spec.js';
import { GAP_STEPS } from './steps.js';

/** A column count, or 'auto' to fit as many 200px tracks as the width allows. */
export const GRID_COLUMNS = ['1', '2', '3', '4', '5', '6', 'auto'] as const;

export const GridSpec: ComponentSpec = {
  key: 'Grid',
  displayName: 'Grid',
  category: 'Layout',
  icon: 'Grid3x3',
  keywords: ['grid', 'layout', 'tiles', 'gallery', 'masonry', 'cards'],
  description: 'Lays children out in equal columns.',

  props: [
    {
      name: 'columns',
      label: 'Columns',
      type: 'enum',
      options: GRID_COLUMNS.map((value) => ({ label: value, value })),
    },
    {
      name: 'gap',
      label: 'Gap',
      type: 'enum',
      options: GAP_STEPS.map((step) => ({ label: step, value: step })),
    },
  ],
  events: ['onClick'],
  acceptsChildren: true,
  layout: 'grid',

  defaultProps: { columns: '2', gap: '4' },
  defaultStyles: { padding: 16 },

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-grid',
      attrs: {
        'data-columns': { prop: 'columns', as: 'enum', options: GRID_COLUMNS, fallback: '2' },
        'data-gap': { prop: 'gap', as: 'enum', options: GAP_STEPS, fallback: '4' },
      },
      children: [{ slot: true }],
    },
  },
};
