import type { ComponentSpec } from '../spec.js';

/**
 * Collapsible rows, authored as text.
 *
 * Each row is a native `<details>`, which is why this compound-looking component is one
 * node and ships no JavaScript: opening and closing is a browser feature, so the exported
 * page works with nothing wired up. The rows are `Title | Body` per line for the reason
 * `Table`'s cells are — an FAQ is data, and twelve rows assembled as twenty-four nodes
 * would be twenty-four things to keep aligned.
 *
 * `interactive`, so the canvas freezes the toggling: the click that opens a row is the
 * click that selects the node, and a row that folded shut under the pointer would be a
 * change the document never recorded. The rows still *draw* open or shut exactly as they
 * will ship — only the gesture is withheld, which is the bargain `Table` strikes with its
 * drag handles.
 */
export const AccordionSpec: ComponentSpec = {
  key: 'Accordion',
  displayName: 'Accordion',
  category: 'Overlay',
  icon: 'ChevronsDownUp',
  // Nothing beginning with 'col', for `Table`'s reason: a keyword prefix scores 70,
  // which ties `VStack`'s 'column', and PLAN.md §7 uses "col" as the query that has to
  // surface Vertical Stack. So 'collapse' is spelled as what it does instead.
  keywords: ['accordion', 'disclosure', 'faq', 'details', 'expand', 'fold', 'toggle', 'reveal'],
  description: 'Collapsible rows of question and answer, authored as a list.',

  props: [
    {
      name: 'items',
      label: 'Rows',
      type: 'text',
      placeholder: 'One per line — Title | Body',
    },
    { name: 'openFirst', label: 'Open the first', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,
  interactive: true,

  defaultProps: {
    items: [
      'What is included? | Every plan carries the editor, the preview and code export.',
      'Can I cancel? | Yes — a plan ends at the close of the period it was paid for.',
      'Do you offer support? | Support is email, and answers land within a business day.',
    ].join('\n'),
    openFirst: true,
  },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-accordion',
      children: [{ disclosures: { items: 'items', open: 'openFirst' } }],
    },
  },
};
