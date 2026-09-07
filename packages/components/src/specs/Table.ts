import type { EmitCondition } from '../emit.js';
import { SORTABLE_ROWS } from '../runtime.js';
import type { ComponentSpec } from '../spec.js';

/**
 * When the body is the draggable kind.
 *
 * Written once and denied once rather than spelled out twice: the two `<tbody>` branches
 * below have to be exact opposites, and two conditions that merely look opposite are two
 * conditions a later edit can leave both true. A table with no rows takes the plain body
 * whatever `reorderable` says — there is nothing to reorder, and the empty line that
 * stands in its place is not a row someone should be able to pick up.
 */
const REORDERS: EmitCondition = {
  all: [
    { prop: 'reorderable', when: 'true' },
    { prop: 'rows', when: 'set' },
  ],
};

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
      name: 'rows',
      label: 'Rows',
      type: 'text',
      placeholder: 'One row per line, cells split by |',
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
          when: { prop: 'columns', when: 'set' },
          tag: 'thead',
          class: 'ub-table-head',
          children: [
            {
              tag: 'tr',
              class: 'ub-table-row',
              children: [{ tableHead: { columns: 'columns', rows: 'rows', grip: 'reorderable' } }],
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
          children: [{ tableRows: { columns: 'columns', rows: 'rows', grip: 'reorderable' } }],
        },
        {
          when: { not: REORDERS },
          tag: 'tbody',
          children: [
            {
              tableRows: {
                columns: 'columns',
                rows: 'rows',
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
