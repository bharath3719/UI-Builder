import type { ComponentSpec } from '../spec.js';

/**
 * `level` is a string rather than a number because it is an enum in the inspector, and
 * because it decides the tag — `h1`–`h4` — not just the size. A heading that looks like
 * an h2 but exports as a div is the kind of thing a builder should make impossible
 * rather than merely discourage.
 */
export const HEADING_LEVELS = ['1', '2', '3', '4'] as const;

export const HeadingSpec: ComponentSpec = {
  key: 'Heading',
  displayName: 'Heading',
  category: 'Basic',
  icon: 'Heading',
  keywords: ['title', 'h1', 'h2', 'h3', 'header', 'headline'],
  description: 'A section title, h1 through h4.',

  props: [
    { name: 'text', label: 'Text', type: 'string', placeholder: 'Heading' },
    {
      name: 'level',
      label: 'Level',
      type: 'enum',
      options: HEADING_LEVELS.map((value) => ({ label: `H${value}`, value })),
    },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { text: 'Heading', level: '2' },
  defaultStyles: {},

  codegen: {
    tag: 'h2',
    emit: {
      // The level picks the element, not just the size — the same rule the component
      // renders by, so an h3 on the canvas is an <h3> in the export.
      tag: { prop: 'level', as: 'enum', options: HEADING_LEVELS, fallback: '2', prefix: 'h' },
      class: 'ub-heading',
      attrs: {
        'data-level': { prop: 'level', as: 'enum', options: HEADING_LEVELS, fallback: '2' },
      },
      children: [{ text: { prop: 'text', as: 'string', fallback: 'Heading' } }],
    },
  },
};
