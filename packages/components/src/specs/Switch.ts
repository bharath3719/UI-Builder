import type { ComponentSpec } from '../spec.js';

export const SwitchSpec: ComponentSpec = {
  key: 'Switch',
  displayName: 'Switch',
  category: 'Form',
  icon: 'ToggleRight',
  keywords: ['toggle', 'on', 'off', 'boolean', 'setting', 'enable'],
  description: 'An on/off toggle.',

  props: [
    { name: 'label', label: 'Label', type: 'string', placeholder: 'Label' },
    { name: 'checked', label: 'On', type: 'boolean' },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onChange'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { label: 'Enabled', checked: false },
  defaultStyles: {},

  codegen: {
    tag: 'label',
    emit: {
      tag: 'label',
      class: 'ub-switch',
      attrs: { 'data-disabled': { prop: 'disabled', as: 'flag', on: '' } },
      children: [
        {
          tag: 'input',
          class: 'ub-switch-input',
          attrs: {
            type: 'checkbox',
            role: 'switch',
            defaultChecked: { prop: 'checked', as: 'boolean' },
            disabled: { prop: 'disabled', as: 'boolean' },
          },
        },
        // An empty label is a real choice — a bare switch in a settings row — so the
        // span is dropped rather than exported as a gap the user has to explain.
        {
          when: { prop: 'label', when: 'set' },
          tag: 'span',
          class: 'ub-switch-label',
          children: [{ text: { prop: 'label', as: 'string' } }],
        },
      ],
    },
  },
};
