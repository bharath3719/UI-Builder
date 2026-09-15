import type { EmitCondition } from '../emit.js';
import type { ComponentSpec } from '../spec.js';

const HAS_HEAD: EmitCondition = {
  any: [
    { prop: 'label', when: 'set' },
    { prop: 'showValue', when: 'true', default: true },
  ],
};

/**
 * How far along something is.
 *
 * A native `<progress>` under the bar, which is the same trade `DatePicker` and `Select`
 * make: the browser already owns this control, it announces itself to a screen reader as a
 * progress bar without an `aria-` prop being typed, and the styling is pseudo-elements
 * rather than a div pretending. A `<div>` with an inline width would also have needed the
 * emit vocabulary to do arithmetic, which is exactly the kind of thing the templates are
 * inert data to avoid (`emit.ts`).
 *
 * The read-out is `value / max` and not a percentage, for the same reason: dividing is
 * arithmetic, and "3 / 7" is the honest reading of a bar that counts steps rather than
 * per cent. A design that wants "43%" writes it in the label.
 */
export const ProgressSpec: ComponentSpec = {
  key: 'Progress',
  displayName: 'Progress',
  category: 'Data',
  icon: 'Gauge',
  keywords: ['progress', 'bar', 'loading', 'meter', 'percent', 'status', 'steps', 'usage'],
  description: 'A bar showing how far along something is.',

  props: [
    { name: 'value', label: 'Value', type: 'number' },
    { name: 'max', label: 'Out of', type: 'number' },
    { name: 'label', label: 'Label', type: 'string', placeholder: 'Uploading' },
    { name: 'showValue', label: 'Show the number', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    value: 60,
    max: 100,
    label: 'Uploading',
    showValue: true,
  },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-progress',
      children: [
        {
          when: HAS_HEAD,
          tag: 'div',
          class: 'ub-progress-head',
          children: [
            {
              when: { prop: 'label', when: 'set' },
              tag: 'span',
              class: 'ub-progress-label',
              children: [{ text: { prop: 'label', as: 'string' } }],
            },
            {
              when: { prop: 'showValue', when: 'true', default: true },
              tag: 'span',
              class: 'ub-progress-value',
              children: [
                { text: { prop: 'value', as: 'number', fallback: 0, min: 0 } },
                { text: ' / ' },
                { text: { prop: 'max', as: 'number', fallback: 100, min: 1 } },
              ],
            },
          ],
        },
        {
          tag: 'progress',
          class: 'ub-progress-bar',
          attrs: {
            value: { prop: 'value', as: 'number', fallback: 0, min: 0 },
            max: { prop: 'max', as: 'number', fallback: 100, min: 1 },
          },
        },
      ],
    },
  },
};
