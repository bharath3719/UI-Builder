import type { ComponentSpec } from '../spec.js';

export const INPUT_TYPES = ['text', 'email', 'password', 'number', 'search', 'tel', 'url'] as const;

export const InputSpec: ComponentSpec = {
  key: 'Input',
  displayName: 'Input',
  category: 'Form',
  icon: 'TextCursorInput',
  keywords: ['field', 'textbox', 'text', 'form', 'entry', 'email', 'password'],
  description: 'A single-line text field.',

  props: [
    { name: 'placeholder', label: 'Placeholder', type: 'string', placeholder: 'Enter a value' },
    {
      name: 'type',
      label: 'Type',
      type: 'enum',
      options: INPUT_TYPES.map((value) => ({ label: value, value })),
    },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onChange', 'onFocus', 'onBlur'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { placeholder: 'Enter a value', type: 'text' },
  defaultStyles: {},

  codegen: {
    tag: 'input',
    emit: {
      tag: 'input',
      class: 'ub-input',
      attrs: {
        type: { prop: 'type', as: 'enum', options: INPUT_TYPES, fallback: 'text' },
        placeholder: { prop: 'placeholder', as: 'string', fallback: '' },
        'data-disabled': { prop: 'disabled', as: 'flag', on: '' },
        disabled: { prop: 'disabled', as: 'boolean' },
      },
    },
  },
};
