import type { ComponentSpec } from '../spec.js';

export const CheckboxSpec: ComponentSpec = {
  key: 'Checkbox',
  displayName: 'Checkbox',
  category: 'Form',
  icon: 'SquareCheck',
  keywords: ['check', 'tick', 'toggle', 'boolean', 'agree', 'option', 'form'],
  description: 'A box the user ticks, with its label.',

  props: [
    { name: 'label', label: 'Label', type: 'string', placeholder: 'Checkbox' },
    { name: 'checked', label: 'Checked', type: 'boolean' },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onChange'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { label: 'Accept terms', checked: false },
  defaultStyles: {},

  codegen: {
    tag: 'label',
    emit: {
      tag: 'label',
      class: 'ub-checkbox',
      attrs: { 'data-disabled': { prop: 'disabled', as: 'flag', on: '' } },
      children: [
        {
          tag: 'input',
          class: 'ub-checkbox-input',
          attrs: {
            type: 'checkbox',
            // `defaultChecked` rather than the component's controlled `checked` +
            // `readOnly`: the document's value is where the exported checkbox starts,
            // not a state it is pinned to. See Select for the same trade.
            defaultChecked: { prop: 'checked', as: 'boolean' },
            disabled: { prop: 'disabled', as: 'boolean' },
          },
        },
        {
          tag: 'span',
          class: 'ub-checkbox-label',
          children: [{ text: { prop: 'label', as: 'string', fallback: 'Checkbox' } }],
        },
      ],
    },
  },
};
