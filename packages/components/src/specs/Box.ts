import type { ComponentSpec } from '../spec.js';

export const BoxSpec: ComponentSpec = {
  key: 'Box',
  displayName: 'Box',
  category: 'Layout',
  icon: 'Square',
  keywords: ['div', 'container', 'block', 'group', 'section', 'wrapper'],
  description: 'A plain container you style yourself.',

  props: [],
  events: ['onClick'],
  acceptsChildren: true,

  defaultProps: {},
  defaultStyles: { padding: 16 },

  codegen: {
    tag: 'div',
    emit: { tag: 'div', class: 'ub-box', children: [{ slot: true }] },
  },
};
