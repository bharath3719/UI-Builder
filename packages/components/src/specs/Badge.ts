import type { ComponentSpec } from '../spec.js';

/** shadcn's badge taxonomy, minus the variants it does not have. */
export const BADGE_VARIANTS = ['default', 'secondary', 'outline', 'destructive'] as const;

export const BadgeSpec: ComponentSpec = {
  key: 'Badge',
  displayName: 'Badge',
  category: 'Basic',
  icon: 'Badge',
  keywords: ['tag', 'pill', 'chip', 'label', 'status', 'count'],
  description: 'A small status pill.',

  props: [
    { name: 'text', label: 'Label', type: 'string', placeholder: 'Badge' },
    {
      name: 'variant',
      label: 'Variant',
      type: 'enum',
      options: BADGE_VARIANTS.map((value) => ({ label: value, value })),
    },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { text: 'Badge', variant: 'default' },
  defaultStyles: {},

  codegen: {
    tag: 'span',
    emit: {
      tag: 'span',
      class: 'ub-badge',
      attrs: {
        'data-variant': {
          prop: 'variant',
          as: 'enum',
          options: BADGE_VARIANTS,
          fallback: 'default',
        },
      },
      children: [{ text: { prop: 'text', as: 'string', fallback: 'Badge' } }],
    },
  },
};
