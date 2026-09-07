import type { ComponentSpec } from '../spec.js';

export const TypingIndicatorSpec: ComponentSpec = {
  key: 'TypingIndicator',
  displayName: 'Typing Indicator',
  category: 'AI',
  icon: 'Ellipsis',
  keywords: ['typing', 'thinking', 'loading', 'dots', 'pending', 'streaming', 'wait', 'ai'],
  description: 'Three dots for a reply in progress.',

  props: [
    { name: 'label', label: 'Label', type: 'string', placeholder: 'Thinking…' },
    { name: 'bubble', label: 'Bubble', type: 'boolean' },
  ],
  events: [],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { label: 'Thinking…', bubble: true },
  defaultStyles: {},

  codegen: {
    tag: 'span',
    emit: {
      tag: 'span',
      class: 'ub-typing-indicator',
      attrs: {
        'data-bubble': { prop: 'bubble', as: 'flag', on: 'true' },
        role: 'status',
      },
      children: [
        {
          tag: 'span',
          class: 'ub-typing-dots',
          attrs: { 'aria-hidden': 'true' },
          // The animation is CSS and ships in the library sheet, so the dots are three
          // empty spans in the export exactly as they are on the canvas.
          children: [
            { tag: 'span', class: 'ub-typing-dot' },
            { tag: 'span', class: 'ub-typing-dot' },
            { tag: 'span', class: 'ub-typing-dot' },
          ],
        },
        {
          when: { prop: 'label', when: 'set' },
          tag: 'span',
          class: 'ub-typing-label',
          children: [{ text: { prop: 'label', as: 'string' } }],
        },
      ],
    },
  },
};
