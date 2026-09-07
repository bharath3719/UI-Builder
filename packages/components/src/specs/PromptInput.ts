import type { ComponentSpec } from '../spec.js';

export const PromptInputSpec: ComponentSpec = {
  key: 'PromptInput',
  displayName: 'Prompt Input',
  category: 'AI',
  icon: 'SendHorizontal',
  keywords: ['prompt', 'composer', 'ask', 'send', 'chat', 'input', 'message', 'ai', 'query'],
  description: 'A prompt composer with a send button.',

  props: [
    { name: 'placeholder', label: 'Placeholder', type: 'string', placeholder: 'Ask anything…' },
    { name: 'value', label: 'Text', type: 'text', placeholder: 'Leave empty to show the prompt' },
    { name: 'buttonLabel', label: 'Button', type: 'string', placeholder: 'Send' },
    { name: 'hint', label: 'Hint', type: 'string', placeholder: 'Enter to send' },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onSubmit', 'onChange'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    placeholder: 'Ask anything…',
    value: '',
    buttonLabel: 'Send',
    hint: 'Enter to send',
    disabled: false,
  },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-prompt-input',
      attrs: { 'data-disabled': { prop: 'disabled', as: 'flag', on: '' } },
      children: [
        {
          tag: 'textarea',
          class: 'ub-prompt-input-field',
          attrs: {
            rows: { const: 2 },
            defaultValue: { prop: 'value', as: 'string', fallback: '' },
            placeholder: { prop: 'placeholder', as: 'string', fallback: 'Ask anything…' },
            disabled: { prop: 'disabled', as: 'boolean' },
          },
        },
        {
          tag: 'div',
          class: 'ub-prompt-input-footer',
          children: [
            // The hint's span is emitted even when empty, for the reason the component
            // renders it that way: the footer is space-between, and dropping the
            // element sends the button to the left edge the moment the text is cleared.
            {
              tag: 'span',
              class: 'ub-prompt-input-hint',
              children: [{ text: { prop: 'hint', as: 'string', fallback: '' } }],
            },
            {
              tag: 'button',
              class: 'ub-prompt-input-send',
              attrs: { type: 'button', disabled: { prop: 'disabled', as: 'boolean' } },
              children: [{ text: { prop: 'buttonLabel', as: 'string', fallback: 'Send' } }],
            },
          ],
        },
      ],
    },
  },
};
