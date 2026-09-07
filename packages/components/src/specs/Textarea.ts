import type { ComponentSpec } from '../spec.js';

export const TextareaSpec: ComponentSpec = {
  key: 'Textarea',
  displayName: 'Textarea',
  category: 'Form',
  icon: 'NotepadText',
  keywords: ['textarea', 'multiline', 'message', 'comment', 'notes', 'paragraph', 'field'],
  description: 'A multi-line text field.',

  props: [
    { name: 'placeholder', label: 'Placeholder', type: 'string', placeholder: 'Type a message' },
    { name: 'rows', label: 'Rows', type: 'number' },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onChange', 'onFocus', 'onBlur'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { placeholder: 'Type a message', rows: 3 },
  defaultStyles: {},

  codegen: {
    tag: 'textarea',
    emit: {
      tag: 'textarea',
      class: 'ub-textarea',
      attrs: {
        // `min` repeats the component's clamp: a hand-edited document carrying 0 would
        // otherwise export a textarea the browser silently renders at 2 rows, which is
        // not the number the inspector is showing.
        rows: { prop: 'rows', as: 'number', fallback: 3, min: 1 },
        placeholder: { prop: 'placeholder', as: 'string', fallback: '' },
        'data-disabled': { prop: 'disabled', as: 'flag', on: '' },
        disabled: { prop: 'disabled', as: 'boolean' },
      },
    },
  },
};
