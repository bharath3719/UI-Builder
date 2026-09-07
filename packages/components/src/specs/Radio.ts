import type { ComponentSpec } from '../spec.js';

export const RADIO_ORIENTATIONS = ['vertical', 'horizontal'] as const;

export const RadioSpec: ComponentSpec = {
  key: 'Radio',
  displayName: 'Radio Group',
  category: 'Form',
  icon: 'CircleDot',
  keywords: ['radio', 'choice', 'option', 'pick', 'one', 'group', 'form', 'select'],
  description: 'One choice out of several, one per line.',

  props: [
    { name: 'options', label: 'Options', type: 'text', placeholder: 'One per line' },
    { name: 'value', label: 'Selected', type: 'string', placeholder: 'Option value' },
    { name: 'name', label: 'Field name', type: 'string', placeholder: 'choice' },
    {
      name: 'orientation',
      label: 'Orientation',
      type: 'enum',
      options: RADIO_ORIENTATIONS.map((value) => ({ label: value, value })),
    },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onChange'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    options: 'one | One\ntwo | Two\nthree | Three',
    value: 'one',
    name: 'choice',
    orientation: 'vertical',
  },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-radio-group',
      attrs: {
        role: 'radiogroup',
        'data-orientation': {
          prop: 'orientation',
          as: 'enum',
          options: RADIO_ORIENTATIONS,
          fallback: 'vertical',
        },
        'data-disabled': { prop: 'disabled', as: 'flag', on: '' },
      },
      // `defaultChecked` rather than the component's controlled `checked` + `readOnly`,
      // the same trade Checkbox and Select make: the document says which radio the
      // shipped group starts on, not which one it is pinned to.
      children: [
        { radios: { options: 'options', name: 'name', checked: 'value', disabled: 'disabled' } },
      ],
    },
  },
};
