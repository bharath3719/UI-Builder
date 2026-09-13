import type { EmitCondition } from '../emit.js';
import { OVERLAY } from '../runtime.js';
import type { ComponentSpec } from '../spec.js';

export const MODAL_SIZES = ['sm', 'md', 'lg'] as const;

/**
 * When the panel has a header at all: something to say, or a way out.
 *
 * Written once and referenced twice rather than spelled out at each element, for
 * `Table`'s reason — the header and the block inside it have to agree about whether
 * there is anything to show, and two conditions that merely look alike are two
 * conditions a later edit can leave disagreeing.
 */
const HAS_HEADING: EmitCondition = {
  any: [
    { prop: 'title', when: 'set' },
    { prop: 'description', when: 'set' },
  ],
};

const HAS_HEADER: EmitCondition = {
  any: [HAS_HEADING, { prop: 'showClose', when: 'true', default: true }],
};

/**
 * A dialog, as one node.
 *
 * It renders **in flow** — a stage holding a dimmed backdrop and a centred panel —
 * rather than pinned to the viewport, and that is the whole design decision here. A
 * `position: fixed` overlay on the canvas would cover the page someone is building and
 * sit outside every rect the editor hit-tests against, so the component people would end
 * up with is one they cannot select. In flow it is a node like any other: droppable,
 * stylable, and the same markup in the export. A design that wants it pinned says so in
 * the Design tab, where `position` and `inset` land on this root element.
 *
 * Opening and closing arrived with the `openOverlay`/`closeOverlay` steps this comment used
 * to be waiting on (PLAN.md §10). `open` is the *initial* state and a real prop rather than
 * an editor flag — `Tooltip`'s bargain, for `Tooltip`'s reason: a modal that ships open
 * ships open, which is D6 rather than a convenience. The canvas draws it whatever that
 * value says, dimmed and labelled when the data says closed, because a modal that hid
 * itself would be a node nobody could find.
 */
export const ModalSpec: ComponentSpec = {
  key: 'Modal',
  displayName: 'Modal',
  category: 'Overlay',
  icon: 'AppWindow',
  keywords: ['modal', 'dialog', 'popup', 'overlay', 'lightbox', 'confirm', 'sheet', 'window'],
  description: 'A dialog panel over a dimmed backdrop.',

  props: [
    { name: 'open', label: 'Open', type: 'boolean' },
    { name: 'title', label: 'Title', type: 'string', placeholder: 'Delete this project?' },
    {
      name: 'description',
      label: 'Description',
      type: 'text',
      placeholder: 'What the reader is agreeing to',
    },
    {
      name: 'size',
      label: 'Width',
      type: 'enum',
      options: MODAL_SIZES.map((value) => ({ label: value, value })),
    },
    { name: 'showClose', label: 'Close button', type: 'boolean' },
    { name: 'dismissable', label: 'Close on backdrop / Esc', type: 'boolean' },
    { name: 'dim', label: 'Dim behind', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: true,
  layout: 'flex',
  overlay: true,

  defaultProps: {
    open: true,
    title: 'Delete this project?',
    description: 'This cannot be undone. Everything in the project goes with it.',
    size: 'md',
    showClose: true,
    dismissable: true,
    dim: true,
  },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      // `Overlay` draws this div itself, exactly as `SortableRows` draws its tbody: the
      // class, the attributes and everything inside still come from this template, so the
      // canvas and the export render the same elements and differ only in whether the
      // panel can be dismissed.
      from: OVERLAY,
      tag: 'div',
      class: 'ub-modal',
      attrs: {
        'data-size': { prop: 'size', as: 'enum', options: MODAL_SIZES, fallback: 'md' },
        'data-dim': { prop: 'dim', as: 'flag', on: '', default: true },
        // Read back by `Overlay` to decide what Escape means, and written here rather than
        // passed separately so the answer lives in the markup both renderings share.
        'data-dismissable': { prop: 'dismissable', as: 'flag', on: '', default: true },
      },
      children: [
        {
          when: { prop: 'dim', when: 'true', default: true },
          tag: 'div',
          class: 'ub-modal-backdrop',
          attrs: {
            'aria-hidden': 'true',
            // Only when the panel may be dismissed: `Overlay` closes on a click on
            // anything carrying this, so a dialog that must be answered simply does not
            // mark its backdrop.
            'data-close': { prop: 'dismissable', as: 'flag', on: '', default: true },
          },
        },
        {
          tag: 'div',
          class: 'ub-modal-panel',
          attrs: { role: 'dialog', 'aria-modal': 'true' },
          children: [
            {
              when: HAS_HEADER,
              tag: 'div',
              class: 'ub-modal-header',
              children: [
                {
                  when: HAS_HEADING,
                  tag: 'div',
                  class: 'ub-modal-heading',
                  children: [
                    {
                      when: { prop: 'title', when: 'set' },
                      tag: 'h2',
                      class: 'ub-modal-title',
                      children: [{ text: { prop: 'title', as: 'string' } }],
                    },
                    {
                      when: { prop: 'description', when: 'set' },
                      tag: 'p',
                      class: 'ub-modal-description',
                      children: [{ text: { prop: 'description', as: 'string' } }],
                    },
                  ],
                },
                {
                  when: { prop: 'showClose', when: 'true', default: true },
                  tag: 'button',
                  class: 'ub-modal-close',
                  attrs: { type: 'button', 'aria-label': 'Close', 'data-close': '' },
                  // The glyph rather than an icon import: this library ships no icon set
                  // into an export (§7), and a multiplication sign is what a close control
                  // has looked like since before there were icon sets.
                  children: [{ text: { const: '×' } }],
                },
              ],
            },
            { tag: 'div', class: 'ub-modal-body', children: [{ slot: true }] },
          ],
        },
      ],
    },
  },
};
