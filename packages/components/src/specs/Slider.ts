import type { ComponentSpec } from '../spec.js';

export const SliderSpec: ComponentSpec = {
  key: 'Slider',
  displayName: 'Slider',
  category: 'Form',
  icon: 'SlidersHorizontal',
  keywords: ['range', 'slide', 'scrub', 'volume', 'amount', 'number', 'form'],
  description: 'A value picked by dragging along a track.',

  props: [
    { name: 'value', label: 'Value', type: 'number', placeholder: '50' },
    { name: 'min', label: 'Min', type: 'number', placeholder: '0' },
    { name: 'max', label: 'Max', type: 'number', placeholder: '100' },
    { name: 'step', label: 'Step', type: 'number', placeholder: '1' },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onChange', 'onFocus', 'onBlur'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { value: 50, min: 0, max: 100, step: 1 },
  defaultStyles: {},

  codegen: {
    tag: 'input',
    emit: {
      tag: 'input',
      class: 'ub-slider',
      attrs: {
        type: 'range',
        // `round: false` on all four, because a slider's numbers are measurements rather
        // than counts: 0.1 is a real step for an opacity control, and rounding it here
        // while `asNumber` in the component does not would make the export disagree with
        // the canvas — the one thing these templates exist to prevent.
        min: { prop: 'min', as: 'number', fallback: 0, round: false },
        max: { prop: 'max', as: 'number', fallback: 100, round: false },
        // No floor: HTML says a step of zero or less falls back to the default step, so
        // the browser already answers this and the canvas gets the same answer.
        step: { prop: 'step', as: 'number', fallback: 1, round: false },
        // `defaultValue`, like Checkbox and Select: the document says where the shipped
        // control starts, not what it is pinned to.
        defaultValue: { prop: 'value', as: 'number', fallback: 50, round: false },
        'data-disabled': { prop: 'disabled', as: 'flag', on: '' },
        disabled: { prop: 'disabled', as: 'boolean' },
      },
    },
  },
};
