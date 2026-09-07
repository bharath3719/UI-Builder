import type { ComponentSpec } from '../spec.js';

export const SelectSpec: ComponentSpec = {
  key: 'Select',
  displayName: 'Select',
  category: 'Form',
  icon: 'ChevronsUpDown',
  keywords: ['dropdown', 'picker', 'choice', 'options', 'combobox', 'menu', 'form'],
  description: 'A dropdown of choices, one per line.',

  props: [
    { name: 'options', label: 'Options', type: 'text', placeholder: 'One per line' },
    { name: 'placeholder', label: 'Placeholder', type: 'string', placeholder: 'Choose an option' },
    { name: 'value', label: 'Selected', type: 'string', placeholder: 'Option value' },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onChange', 'onFocus', 'onBlur'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    options: 'one | One\ntwo | Two\nthree | Three',
    placeholder: 'Choose an option',
    value: '',
  },
  defaultStyles: {},

  codegen: {
    tag: 'select',
    emit: {
      tag: 'select',
      class: 'ub-select',
      attrs: {
        // `defaultValue`, where the component uses a controlled `value` with an empty
        // handler. The canvas needs a select that cannot be changed by clicking it; an
        // exported page needs one that can. Both start on the same option, which is the
        // part D6 is actually about.
        defaultValue: { prop: 'value', as: 'string', fallback: '' },
        disabled: { prop: 'disabled', as: 'boolean' },
        'data-disabled': { prop: 'disabled', as: 'flag', on: '' },
        'data-placeholder': {
          when: {
            all: [
              { prop: 'value', when: 'unset' },
              { prop: 'placeholder', when: 'set' },
            ],
          },
          value: '',
        },
      },
      children: [
        // Hidden rather than merely disabled: the prompt is what a closed select shows
        // before a choice is made, not one of the choices.
        {
          when: { prop: 'placeholder', when: 'set' },
          tag: 'option',
          attrs: { value: '', disabled: { const: true }, hidden: { const: true } },
          children: [{ text: { prop: 'placeholder', as: 'string' } }],
        },
        { options: { prop: 'options' } },
      ],
    },
  },
};
