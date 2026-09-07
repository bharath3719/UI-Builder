import type { EmitElement } from '../emit.js';
import type { ComponentSpec } from '../spec.js';
import { GAP_STEPS } from './steps.js';

export const STACK_ALIGN = ['start', 'center', 'end', 'stretch', 'baseline'] as const;
export const STACK_JUSTIFY = ['start', 'center', 'end', 'between', 'around'] as const;

/**
 * `gap`, `align`, `justify` and `wrap` are props rather than raw CSS because the common
 * case — "a column of things, 16px apart" — should cost two clicks in the palette and
 * none in the inspector. Anything beyond that still falls through to the node's own
 * styles, which are applied by a later rule and therefore win.
 */
const STACK_PROPS: ComponentSpec['props'] = [
  {
    name: 'gap',
    label: 'Gap',
    type: 'enum',
    options: GAP_STEPS.map((step) => ({ label: step, value: step })),
  },
  {
    name: 'align',
    label: 'Align',
    type: 'enum',
    options: STACK_ALIGN.map((value) => ({ label: value, value })),
  },
  {
    name: 'justify',
    label: 'Justify',
    type: 'enum',
    options: STACK_JUSTIFY.map((value) => ({ label: value, value })),
  },
  { name: 'wrap', label: 'Wrap', type: 'boolean' },
];

/**
 * One template, parameterised the same way the two components are: `direction` is the
 * only thing `VStack` and `HStack` disagree about, in the export exactly as in the
 * render, so it is the only thing passed in.
 */
function stackEmit(direction: 'vertical' | 'horizontal'): EmitElement {
  return {
    tag: 'div',
    class: 'ub-stack',
    attrs: {
      'data-direction': direction,
      'data-gap': { prop: 'gap', as: 'enum', options: GAP_STEPS, fallback: '4' },
      'data-align': { prop: 'align', as: 'enum', options: STACK_ALIGN, fallback: 'stretch' },
      'data-justify': { prop: 'justify', as: 'enum', options: STACK_JUSTIFY, fallback: 'start' },
      'data-wrap': { prop: 'wrap', as: 'flag', on: 'true' },
    },
    children: [{ slot: true }],
  };
}

/**
 * Two palette entries, one implementation. They stay separate because "vertical
 * stack" and "horizontal stack" are what someone searches for — a single `Stack` with
 * a direction prop is one more decision at the moment they least want one.
 */
export const VStackSpec: ComponentSpec = {
  key: 'VStack',
  displayName: 'Vertical Stack',
  category: 'Layout',
  icon: 'Rows3',
  keywords: ['column', 'col', 'vbox', 'flex', 'vertical', 'stack', 'list'],
  description: 'Stacks children top to bottom.',

  props: STACK_PROPS,
  events: ['onClick'],
  acceptsChildren: true,
  layout: 'flex',

  defaultProps: { gap: '4', align: 'stretch', justify: 'start' },
  defaultStyles: { padding: 16 },

  codegen: { tag: 'div', emit: stackEmit('vertical') },
};

export const HStackSpec: ComponentSpec = {
  key: 'HStack',
  displayName: 'Horizontal Stack',
  category: 'Layout',
  icon: 'Columns3',
  keywords: ['row', 'hbox', 'flex', 'horizontal', 'stack', 'inline'],
  description: 'Stacks children left to right.',

  props: STACK_PROPS,
  events: ['onClick'],
  acceptsChildren: true,
  layout: 'flex',

  defaultProps: { gap: '4', align: 'center', justify: 'start' },
  defaultStyles: { padding: 16 },

  codegen: { tag: 'div', emit: stackEmit('horizontal') },
};
