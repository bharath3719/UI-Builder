import type { ComponentSpec } from '../spec.js';

export const TOOLTIP_SIDES = ['top', 'bottom', 'left', 'right'] as const;

/**
 * A hint attached to whatever is dropped inside it.
 *
 * The bubble is shown by CSS — `:hover` and `:focus-within` on the wrapper — so the
 * exported page has a working tooltip with no JavaScript and no library, which is the
 * same bargain `Accordion` strikes with `<details>`. Keyboard users get it too, and that
 * is the `:focus-within` half rather than a courtesy.
 *
 * `visible` pins the bubble open. It exists because a tooltip is the one component whose
 * whole appearance is behind a gesture the canvas is busy using for something else: with
 * it off, styling the bubble would mean styling something you cannot see. It is a real
 * prop rather than an editor-only flag, so what the canvas shows is what the export does
 * (D6) — a pinned tooltip ships pinned.
 */
export const TooltipSpec: ComponentSpec = {
  key: 'Tooltip',
  displayName: 'Tooltip',
  category: 'Overlay',
  icon: 'MessageCircle',
  keywords: ['tooltip', 'hint', 'tip', 'hover', 'popover', 'help', 'label', 'bubble'],
  description: 'A hint that appears on hover, wrapped around whatever is inside it.',

  props: [
    { name: 'label', label: 'Text', type: 'string', placeholder: 'What this does' },
    {
      name: 'side',
      label: 'Side',
      type: 'enum',
      options: TOOLTIP_SIDES.map((value) => ({ label: value, value })),
    },
    { name: 'visible', label: 'Always show', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: true,
  layout: 'flex',

  defaultProps: {
    label: 'What this does',
    side: 'top',
    visible: false,
  },
  defaultStyles: {},

  codegen: {
    tag: 'span',
    emit: {
      tag: 'span',
      class: 'ub-tooltip',
      attrs: {
        'data-side': { prop: 'side', as: 'enum', options: TOOLTIP_SIDES, fallback: 'top' },
        'data-visible': { prop: 'visible', as: 'flag', on: '' },
      },
      children: [
        { tag: 'span', class: 'ub-tooltip-trigger', children: [{ slot: true }] },
        {
          when: { prop: 'label', when: 'set' },
          tag: 'span',
          class: 'ub-tooltip-bubble',
          attrs: { role: 'tooltip' },
          children: [{ text: { prop: 'label', as: 'string' } }],
        },
      ],
    },
  },
};
