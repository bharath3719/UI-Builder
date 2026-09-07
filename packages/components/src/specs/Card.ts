import type { ComponentSpec } from '../spec.js';

export const CardSpec: ComponentSpec = {
  key: 'Card',
  displayName: 'Card',
  category: 'Data',
  icon: 'IdCard',
  keywords: ['panel', 'surface', 'tile', 'box', 'container', 'well'],
  description: 'A bordered surface for a group of things.',

  props: [{ name: 'elevated', label: 'Shadow', type: 'boolean' }],
  events: ['onClick'],
  acceptsChildren: true,
  layout: 'flex',

  defaultProps: { elevated: false },
  defaultStyles: { padding: 24 },

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-card',
      attrs: { 'data-elevated': { prop: 'elevated', as: 'flag', on: 'true' } },
      children: [{ slot: true }],
    },
  },
};
