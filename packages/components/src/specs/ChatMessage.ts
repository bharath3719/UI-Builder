import type { ComponentSpec } from '../spec.js';

/**
 * The three roles every chat transcript is made of. `assistant` leads because it is the
 * message someone designing an AI surface spends their time on.
 */
export const CHAT_ROLES = ['assistant', 'user', 'system'] as const;

export const ChatMessageSpec: ComponentSpec = {
  key: 'ChatMessage',
  displayName: 'Chat Message',
  category: 'AI',
  icon: 'MessageSquareText',
  keywords: ['message', 'bubble', 'chat', 'reply', 'turn', 'assistant', 'user', 'prompt', 'ai'],
  description: 'One turn in a conversation.',

  props: [
    {
      name: 'role',
      label: 'Role',
      type: 'enum',
      options: CHAT_ROLES.map((value) => ({ label: value, value })),
    },
    { name: 'author', label: 'Author', type: 'string', placeholder: 'Assistant' },
    { name: 'text', label: 'Message', type: 'text', placeholder: 'Write the message' },
    { name: 'showAvatar', label: 'Avatar', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    role: 'assistant',
    author: 'Assistant',
    text: 'How can I help you today?',
    showAvatar: true,
  },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-chat-message',
      attrs: {
        'data-role': { prop: 'role', as: 'enum', options: CHAT_ROLES, fallback: 'assistant' },
      },
      children: [
        // A system line is a note about the conversation rather than a turn in it, so
        // it has no speaker to show — the avatar would be a disc with nobody in it.
        {
          when: {
            all: [
              {
                prop: 'role',
                when: 'isNot',
                value: 'system',
                options: CHAT_ROLES,
                fallback: 'assistant',
              },
              { prop: 'showAvatar', when: 'true', default: true },
            ],
          },
          tag: 'span',
          class: 'ub-chat-message-avatar',
          attrs: { 'aria-hidden': 'true' },
          children: [
            {
              text: {
                prop: 'author',
                as: 'initial',
                or: { prop: 'role', as: 'enum', options: CHAT_ROLES, fallback: 'assistant' },
              },
            },
          ],
        },
        {
          tag: 'div',
          class: 'ub-chat-message-body',
          children: [
            {
              when: { prop: 'author', when: 'set' },
              tag: 'span',
              class: 'ub-chat-message-author',
              children: [{ text: { prop: 'author', as: 'string' } }],
            },
            {
              tag: 'div',
              class: 'ub-chat-message-bubble',
              children: [{ text: { prop: 'text', as: 'string' } }],
            },
          ],
        },
      ],
    },
  },
};
