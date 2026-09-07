import type { ComponentSpec } from '../spec.js';

export const ChatThreadSpec: ComponentSpec = {
  key: 'ChatThread',
  displayName: 'Chat Thread',
  category: 'AI',
  icon: 'MessagesSquare',
  keywords: ['chat', 'conversation', 'messages', 'thread', 'transcript', 'history', 'ai', 'log'],
  description: 'A column of chat messages.',

  props: [{ name: 'bordered', label: 'Surface', type: 'boolean' }],
  events: ['onClick'],
  acceptsChildren: true,
  layout: 'flex',

  defaultProps: { bordered: false },
  defaultStyles: { padding: 16 },

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-chat-thread',
      attrs: { 'data-bordered': { prop: 'bordered', as: 'flag', on: 'true' } },
      children: [{ slot: true }],
    },
  },
};
