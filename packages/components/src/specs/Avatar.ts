import type { ComponentSpec } from '../spec.js';

export const AVATAR_SIZES = ['sm', 'default', 'lg'] as const;

export const AvatarSpec: ComponentSpec = {
  key: 'Avatar',
  displayName: 'Avatar',
  category: 'Basic',
  icon: 'CircleUser',
  keywords: ['user', 'profile', 'person', 'photo', 'initials', 'account'],
  description: 'A profile image, with initials as a fallback.',

  props: [
    { name: 'src', label: 'Image', type: 'url', placeholder: 'https://…' },
    { name: 'alt', label: 'Alt text', type: 'string', placeholder: 'Describe the person' },
    { name: 'fallback', label: 'Name', type: 'string', placeholder: 'Ada Lovelace' },
    {
      name: 'size',
      label: 'Size',
      type: 'enum',
      options: AVATAR_SIZES.map((value) => ({ label: value, value })),
    },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { alt: '', fallback: 'Ada Lovelace', size: 'default' },
  defaultStyles: {},

  codegen: {
    tag: 'span',
    emit: {
      tag: 'span',
      class: 'ub-avatar',
      attrs: {
        'data-size': { prop: 'size', as: 'enum', options: AVATAR_SIZES, fallback: 'default' },
      },
      // Image or initials, never both — the same either/or the component renders. The
      // branch that loses is not written at all, because a Phase 10 document's props
      // are literals and the decision is therefore already made at export time.
      children: [
        {
          when: { prop: 'src', when: 'set' },
          tag: 'img',
          class: 'ub-avatar-image',
          attrs: {
            src: { prop: 'src', as: 'string' },
            alt: { prop: 'alt', as: 'string', fallback: '' },
            draggable: { const: false },
          },
        },
        {
          when: { prop: 'src', when: 'unset' },
          tag: 'span',
          class: 'ub-avatar-fallback',
          children: [{ text: { prop: 'fallback', as: 'initials' } }],
        },
      ],
    },
  },
};
