import type { EmitCondition } from '../emit.js';
import { SORTABLE_ROWS } from '../runtime.js';
import type { ComponentSpec } from '../spec.js';

/**
 * When the body is the draggable kind.
 *
 * Written once and denied once rather than spelled out twice: the two `<tbody>` branches
 * below have to be exact opposites, and two conditions that merely look opposite are two
 * conditions a later edit can leave both true.
 *
 * It used to also require `rows` to be set, so that an empty table took the plain body —
 * "the empty line that stands in its place is not a row someone should be able to pick
 * up". That clause is gone, for two reasons. It was defending against something the
 * markup already prevents: `SortableRows` picks up only rows carrying `data-grip`, and the
 * empty row has no grip to carry. And once `rows` can be *bound*, "is it set" stops being
 * answerable while generating — so the condition became a run-time check, and the whole
 * body was emitted twice, once under each branch, in every export of a reorderable table
 * fed by a query.
 */
const REORDERS: EmitCondition = { prop: 'reorderable', when: 'true' };

export const TableSpec: ComponentSpec = {
  key: 'Table',
  displayName: 'Table',
  category: 'Data',
  icon: 'Table',
  // Nothing beginning with 'col': a keyword prefix scores 70, which ties `VStack`'s
  // 'column', and PLAN.md §7 uses "col" as the query that has to surface Vertical Stack.
  keywords: ['table', 'rows', 'data', 'grid', 'spreadsheet', 'sortable', 'reorder', 'drag'],
  description: 'Rows and columns of text, optionally draggable into a new order.',

  props: [
    { name: 'columns', label: 'Columns', type: 'string', placeholder: 'Name | Role | Status' },
    {
      // `data` rather than `text`: bound to a query this holds the rows themselves, and
      // `coerceToProp` narrowing a `text` prop would hand `buildTable` the JSON of the
      // array instead of the array — a table that reads as its own payload on the canvas
      // and as a table in the export.
      name: 'rows',
      label: 'Rows',
      type: 'data',
      placeholder: 'One row per line, cells split by |',
    },
    /*
     * Which key of each row goes in which column, aligned with `columns`.
     *
     * Only meaningful once `rows` is bound to an array — a table typed out as text already
     * says what is in each column by position. Kept as a separate prop from `columns`
     * because a heading and a field name are different things that happen to line up:
     * folding them into `Full name:name` would make a heading with a colon in it unsayable.
     * Left empty, the rows' own keys are used in the order the data has them.
     */
    {
      name: 'fields',
      label: 'Fields',
      type: 'string',
      placeholder: 'name | role | status',
    },
    { name: 'caption', label: 'Caption', type: 'string', placeholder: 'What this table shows' },
    { name: 'reorderable', label: 'Drag to reorder', type: 'boolean' },
    { name: 'striped', label: 'Striped', type: 'boolean' },
    { name: 'bordered', label: 'Border', type: 'boolean' },
    { name: 'compact', label: 'Compact', type: 'boolean' },
    { name: 'emptyText', label: 'Empty message', type: 'string', placeholder: 'No rows yet.' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,
  // The rows answer to the reader, not to the canvas: without this the renderer would
  // leave them draggable while editing, and the gesture that picks up a row is the same
  // gesture that moves the node.
  interactive: true,

  defaultProps: {
    columns: 'Name | Role | Status',
    rows: 'Ada Lovelace | Owner | Active\nGrace Hopper | Editor | Active\nAlan Turing | Viewer | Invited',
    fields: '',
    caption: '',
    // On by default: it is what someone reaching for this component came for, and a
    // feature nobody sees until they find a checkbox is a feature nobody finds.
    reorderable: true,
    striped: false,
    bordered: false,
    compact: false,
    emptyText: 'No rows yet.',
  },
  defaultStyles: {},

  codegen: {
    tag: 'table',
    emit: {
      tag: 'table',
      class: 'ub-table',
      attrs: {
        'data-striped': { prop: 'striped', as: 'flag', on: '' },
        'data-bordered': { prop: 'bordered', as: 'flag', on: '' },
        'data-compact': { prop: 'compact', as: 'flag', on: '' },
      },
      children: [
        {
          when: { prop: 'caption', when: 'set' },
          tag: 'caption',
          class: 'ub-table-caption',
          children: [{ text: { prop: 'caption', as: 'string' } }],
        },
        {
          /*
           * Either a heading line or a field list is enough to draw a header.
           *
           * `fields` earns its place here because a table bound to a query with no
           * headings written still has column names worth showing — the field names — and
           * a headerless grid of values is markedly harder to read than one labelled with
           * what the API calls things. A table typed out as text has no `fields`, so this
           * is exactly the old condition for every document that predates data binding.
           */
          when: {
            any: [
              { prop: 'columns', when: 'set' },
              { prop: 'fields', when: 'set' },
            ],
          },
          tag: 'thead',
          class: 'ub-table-head',
          children: [
            {
              tag: 'tr',
              class: 'ub-table-row',
              children: [
                {
                  tableHead: {
                    columns: 'columns',
                    rows: 'rows',
                    fields: 'fields',
                    grip: 'reorderable',
                  },
                },
              ],
            },
          ],
        },
        {
          when: REORDERS,
          // A tbody is what this is; `from` is what writes it. The rows inside come from
          // the same transform as the plain branch, which is what makes the two tables
          // the same table — one of them can be picked up.
          tag: 'tbody',
          from: SORTABLE_ROWS,
          children: [
            {
              tableRows: {
                columns: 'columns',
                rows: 'rows',
                fields: 'fields',
                grip: 'reorderable',
                // The reorderable body has to be able to say it is empty too. It did not
                // need to while `REORDERS` also required `rows` to be set — an empty table
                // was always the other branch — and dropping that clause is what made this
                // the branch an empty reorderable table takes. Without it the table
                // rendered as a bare `<SortableRows />` and the message vanished.
                empty: 'emptyText',
              },
            },
          ],
        },
        {
          when: { not: REORDERS },
          tag: 'tbody',
          children: [
            {
              tableRows: {
                columns: 'columns',
                rows: 'rows',
                fields: 'fields',
                grip: 'reorderable',
                empty: 'emptyText',
              },
            },
          ],
        },
      ],
    },
  },
};
