import type { ComponentSpec } from '../spec.js';

export const ALERT_VARIANTS = ['info', 'success', 'warning', 'danger'] as const;

/**
 * A message the page needs the reader to notice.
 *
 * The icon is a `::before` on an empty span rather than markup that changes with the
 * variant, and that is what keeps one template covering four states: the element is the
 * same in every case, so the variant moves the colour, the glyph and the border together
 * from the stylesheet. It also keeps the library's promise that an export ships no icon
 * set — `Icon` is still parked on that decision (§7), and a callout should not be what
 * forces it.
 *
 * `variant` names the four states rather than the four colours, so retheming a project
 * moves them instead of stranding a component styled `red`. Two of the four ride on
 * theme tokens directly (`muted-foreground`, `destructive`); the other two cannot,
 * because the shadcn token set carries no success or warning colour — those are
 * `--ub-success` and `--ub-warning` in `css.ts`, declared once so that a project which
 * wants its own overrides two custom properties rather than four component rules.
 */
export const AlertSpec: ComponentSpec = {
  key: 'Alert',
  displayName: 'Alert',
  category: 'Basic',
  icon: 'Info',
  keywords: ['alert', 'callout', 'banner', 'notice', 'warning', 'error', 'info', 'message'],
  description: 'A callout for something the reader should notice.',

  props: [
    {
      name: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ALERT_VARIANTS.map((value) => ({ label: value, value })),
    },
    { name: 'title', label: 'Title', type: 'string', placeholder: 'Heads up' },
    { name: 'text', label: 'Message', type: 'text', placeholder: 'What happened' },
    { name: 'showIcon', label: 'Icon', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    variant: 'info',
    title: 'Heads up',
    text: 'This project has unsaved changes.',
    showIcon: true,
  },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-alert',
      attrs: {
        role: 'note',
        'data-variant': { prop: 'variant', as: 'enum', options: ALERT_VARIANTS, fallback: 'info' },
      },
      children: [
        {
          when: { prop: 'showIcon', when: 'true', default: true },
          tag: 'span',
          class: 'ub-alert-icon',
          attrs: { 'aria-hidden': 'true' },
        },
        {
          tag: 'div',
          class: 'ub-alert-body',
          children: [
            {
              when: { prop: 'title', when: 'set' },
              tag: 'span',
              class: 'ub-alert-title',
              children: [{ text: { prop: 'title', as: 'string' } }],
            },
            {
              when: { prop: 'text', when: 'set' },
              tag: 'span',
              class: 'ub-alert-text',
              children: [{ text: { prop: 'text', as: 'string' } }],
            },
          ],
        },
      ],
    },
  },
};
