import type { ComponentSpec } from '../spec.js';

export const TEXT_SIZES = ['sm', 'base', 'lg'] as const;
export const TEXT_TONES = ['default', 'muted'] as const;

export const TextSpec: ComponentSpec = {
  key: 'Text',
  displayName: 'Text',
  category: 'Basic',
  icon: 'Type',
  keywords: ['paragraph', 'p', 'copy', 'label', 'body', 'string'],
  description: 'A paragraph of body text.',

  props: [
    { name: 'text', label: 'Text', type: 'text', placeholder: 'Text' },
    {
      name: 'size',
      label: 'Size',
      type: 'enum',
      options: TEXT_SIZES.map((value) => ({ label: value, value })),
    },
    {
      name: 'tone',
      label: 'Tone',
      type: 'enum',
      options: TEXT_TONES.map((value) => ({ label: value, value })),
    },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { text: 'Text', size: 'base', tone: 'default' },
  defaultStyles: {},

  codegen: {
    tag: 'p',
    emit: {
      tag: 'p',
      class: 'ub-text',
      attrs: {
        'data-size': { prop: 'size', as: 'enum', options: TEXT_SIZES, fallback: 'base' },
        'data-tone': { prop: 'tone', as: 'enum', options: TEXT_TONES, fallback: 'default' },
      },
      // `fallback`, not `orElse`: clearing the field in the inspector means an empty
      // paragraph, and the export has to agree with the canvas about that.
      children: [{ text: { prop: 'text', as: 'string', fallback: 'Text' } }],
    },
  },
};
