import type { ComponentSpec } from '../spec.js';

export const LINK_TARGETS = ['self', 'blank'] as const;
export const LINK_UNDERLINE = ['hover', 'always', 'none'] as const;

export const LinkSpec: ComponentSpec = {
  key: 'Link',
  displayName: 'Link',
  category: 'Basic',
  icon: 'Link',
  keywords: ['a', 'anchor', 'href', 'url', 'navigate', 'hyperlink'],
  description: 'A text link to another page.',

  props: [
    { name: 'text', label: 'Label', type: 'string', placeholder: 'Link' },
    { name: 'href', label: 'URL', type: 'url', placeholder: 'https://…' },
    {
      name: 'target',
      label: 'Opens in',
      type: 'enum',
      options: [
        { label: 'Same tab', value: 'self' },
        { label: 'New tab', value: 'blank' },
      ],
    },
    {
      name: 'underline',
      label: 'Underline',
      type: 'enum',
      options: LINK_UNDERLINE.map((value) => ({ label: value, value })),
    },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { text: 'Link', href: '#', target: 'self', underline: 'hover' },
  defaultStyles: {},

  codegen: {
    tag: 'a',
    emit: {
      tag: 'a',
      class: 'ub-link',
      attrs: {
        // `orElse`, not `fallback`: an anchor with an empty href is not a link, so a
        // cleared field still exports as '#' rather than as a dead element.
        href: { prop: 'href', as: 'string', orElse: '#' },
        // One prop, two attributes — the reason `flag` takes `equals`. A new-tab link
        // cannot be exported without its rel, the same way it cannot be rendered
        // without one.
        target: { prop: 'target', as: 'flag', equals: 'blank', on: '_blank' },
        rel: { prop: 'target', as: 'flag', equals: 'blank', on: 'noreferrer noopener' },
        'data-underline': {
          prop: 'underline',
          as: 'enum',
          options: LINK_UNDERLINE,
          fallback: 'hover',
        },
      },
      children: [{ text: { prop: 'text', as: 'string', fallback: 'Link' } }],
    },
  },
};
