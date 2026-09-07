import type { ComponentSpec } from '../spec.js';

/**
 * One component covers four pickers because the browser's are four spellings of one
 * control: the same box, the same keyboard model, the same value format, differing only
 * in which fields it shows. Shipping `DatePicker`, `TimePicker` and `MonthPicker` as
 * three palette entries would be three specs with identical bodies and a user having to
 * know which one to reach for before they know what they want.
 */
export const DATE_KINDS = ['date', 'time', 'datetime-local', 'month'] as const;

export const DatePickerSpec: ComponentSpec = {
  key: 'DatePicker',
  displayName: 'Date',
  category: 'Form',
  icon: 'Calendar',
  keywords: [
    'date',
    'datepicker',
    'calendar',
    'time',
    'clock',
    'month',
    'schedule',
    'form',
    'when',
  ],
  description: 'A date, time or month field.',

  props: [
    {
      name: 'kind',
      label: 'Kind',
      type: 'enum',
      options: [
        { label: 'date', value: 'date' },
        { label: 'time', value: 'time' },
        { label: 'date & time', value: 'datetime-local' },
        { label: 'month', value: 'month' },
      ],
    },
    { name: 'value', label: 'Value', type: 'string', placeholder: '2026-01-31' },
    { name: 'min', label: 'Earliest', type: 'string', placeholder: 'No limit' },
    { name: 'max', label: 'Latest', type: 'string', placeholder: 'No limit' },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onChange', 'onFocus', 'onBlur'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { kind: 'date', value: '' },
  defaultStyles: {},

  codegen: {
    tag: 'input',
    emit: {
      tag: 'input',
      class: 'ub-date',
      attrs: {
        type: { prop: 'kind', as: 'enum', options: DATE_KINDS, fallback: 'date' },
        // `orElse` is wrong here and `fallback` is right: an empty bound is no bound,
        // and `min=""` on a date input is a constraint that matches nothing.
        defaultValue: { prop: 'value', as: 'string', fallback: '' },
        min: { when: { prop: 'min', when: 'set' }, value: { prop: 'min', as: 'string' } },
        max: { when: { prop: 'max', when: 'set' }, value: { prop: 'max', as: 'string' } },
        'data-disabled': { prop: 'disabled', as: 'flag', on: '' },
        disabled: { prop: 'disabled', as: 'boolean' },
      },
    },
  },
};
