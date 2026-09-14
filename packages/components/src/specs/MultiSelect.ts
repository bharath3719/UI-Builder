import type { ComponentSpec } from '../spec.js';

/**
 * A dropdown that takes several answers.
 *
 * Built out of a native `<details>` and real checkboxes, which is the same bargain
 * `Accordion` strikes and it buys the same thing: the panel opens in an exported page with
 * nothing wired up, and the choices submit under one field name because they are inputs
 * rather than a script's idea of a selection. `<select multiple>` was the other candidate
 * and is a listbox rather than a dropdown — it cannot close, so it takes eight rows of the
 * page to offer eight choices.
 *
 * Options are text, one per line, for `Select`'s reason (PLAN.md §7): a list of choices is
 * data, and typing it is faster than dropping six nodes. `value` is a comma-separated list
 * of the values that start ticked — the plural of `Select`'s single `value`, and the reason
 * this is a `Form` component the canvas freezes: a tick belongs to the inspector while the
 * page is being designed and to the reader everywhere else.
 *
 * `open` is on the spec rather than only in the reader's hands because a closed dropdown is
 * a rectangle: a designer has to be able to see the panel to style it, and the same prop is
 * what an exported page starts open on. It round-trips, so nothing here is editor-only.
 */
export const MultiSelectSpec: ComponentSpec = {
  key: 'MultiSelect',
  displayName: 'Multi Select',
  category: 'Form',
  icon: 'ListChecks',
  keywords: [
    'multi',
    'multiple',
    'multiselect',
    'dropdown',
    'tags',
    'chips',
    'checklist',
    'options',
    'picker',
    'form',
  ],
  description: 'A dropdown of checkboxes — several choices at once.',

  props: [
    {
      name: 'options',
      label: 'Options',
      type: 'text',
      placeholder: 'One per line — value | Label',
    },
    { name: 'value', label: 'Selected', type: 'string', placeholder: 'one, three' },
    { name: 'placeholder', label: 'Placeholder', type: 'string', placeholder: 'Choose options' },
    { name: 'name', label: 'Field name', type: 'string', placeholder: 'choices' },
    { name: 'open', label: 'Show the list open', type: 'boolean' },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onChange'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    options: 'one | One\ntwo | Two\nthree | Three',
    value: 'one',
    placeholder: 'Choose options',
    name: 'choices',
  },
  defaultStyles: {},

  codegen: {
    tag: 'details',
    emit: {
      tag: 'details',
      class: 'ub-multiselect',
      attrs: {
        open: { prop: 'open', as: 'boolean' },
        'data-disabled': { prop: 'disabled', as: 'flag', on: '' },
      },
      children: [
        {
          tag: 'summary',
          class: 'ub-multiselect-field',
          children: [
            // The chips and the prompt are exclusive, and stated as two elements rather
            // than one with a computed class: the field either names what is chosen or
            // says what to do, and those are different-looking things.
            {
              when: { prop: 'value', when: 'set' },
              tag: 'span',
              class: 'ub-multiselect-chips',
              children: [{ chips: { options: 'options', selected: 'value' } }],
            },
            {
              when: { prop: 'value', when: 'unset' },
              tag: 'span',
              class: 'ub-multiselect-placeholder',
              children: [{ text: { prop: 'placeholder', as: 'string' } }],
            },
          ],
        },
        {
          tag: 'div',
          class: 'ub-multiselect-menu',
          // `group` rather than `listbox`: the rows are checkboxes, and a listbox whose
          // options are inputs is a role that contradicts its own children.
          attrs: { role: 'group' },
          children: [
            {
              checkOptions: {
                options: 'options',
                name: 'name',
                checked: 'value',
                disabled: 'disabled',
              },
            },
          ],
        },
      ],
    },
  },
};
