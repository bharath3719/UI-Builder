/**
 * A `Table` whose rows come from a query, in the export.
 *
 * This is the case PLAN.md §15 called "a bound source prop on a named transform", and the
 * reason it was hard is worth restating: a named transform exists because the *shape* of
 * what it emits depends on what was typed, and a bound prop has nothing typed to read. A
 * table is where that stops being true — once the columns are declared separately from the
 * data, the shape is known at generation time and only the values are not.
 *
 * So these tests are mostly about one thing: that the generated page contains no table
 * machinery at all, just a `.map()` over an expression, exactly as a `repeat` produces.
 */

import { describe, expect, test } from 'vitest';
import {
  DEFAULT_THEME,
  exprProp,
  makeNode,
  makePage,
  staticProp,
  type Node,
  type Page,
  type QueryDef,
} from '@ui-builder/schema';
import { generatePage } from './page.js';

const USERS: QueryDef = {
  id: 'q1',
  name: 'people',
  runOnLoad: true,
  source: { kind: 'url', method: 'GET', url: 'https://x.test/people' },
};

function tablePage(props: {
  columns?: string;
  fields?: string;
  rows?: string;
  boundRows?: string;
  reorderable?: boolean;
}): Page {
  const root = makeNode({ id: 'root', type: 'Box', name: 'Page', children: ['t1'] });
  const table: Node = makeNode({
    id: 't1',
    type: 'Table',
    name: 'People',
    parentId: 'root',
    props: {
      columns: staticProp(props.columns ?? 'Name | Role'),
      fields: staticProp(props.fields ?? ''),
      reorderable: staticProp(props.reorderable ?? false),
      emptyText: staticProp(''),
      ...(props.boundRows === undefined
        ? { rows: staticProp(props.rows ?? '') }
        : { rows: exprProp(props.boundRows) }),
    },
  });

  return makePage({
    id: 'p',
    name: 'Home',
    path: '/',
    rootId: 'root',
    nodes: { root, t1: table },
    queries: [USERS],
  });
}

function tsxOf(props: Parameters<typeof tablePage>[0]): string {
  return generatePage(tablePage(props), DEFAULT_THEME).tsx;
}

describe('a table bound to an array', () => {
  test('emits a map over the expression rather than literal rows', () => {
    const tsx = tsxOf({
      boundRows: '{{ queries.people.data.items }}',
      fields: 'name | role',
    });

    expect(tsx).toContain('{list(queries.people.data.items).map((row, index) => (');
    expect(tsx).toContain('<tr key={index} className="ub-table-row">');
  });

  test('reads one field per column, in the order the fields were written', () => {
    const tsx = tsxOf({
      boundRows: '{{ queries.people.data.items }}',
      columns: 'Role | Name',
      fields: 'role | name',
    });

    const body = tsx.slice(tsx.indexOf('<tbody'));
    expect(body.indexOf("cell(row, 'role')")).toBeLessThan(body.indexOf("cell(row, 'name')"));
  });

  test('keeps the declared headings, which are static either way', () => {
    const tsx = tsxOf({
      boundRows: '{{ queries.people.data.items }}',
      columns: 'Full name | Job',
      fields: 'name | role',
    });

    expect(tsx).toContain('Full name');
    expect(tsx).toContain('Job');
  });

  /** Binding a response and choosing nothing else should still produce a readable table. */
  test('falls back to the field names when no headings were written', () => {
    const tsx = tsxOf({
      boundRows: '{{ queries.people.data.items }}',
      columns: '',
      fields: 'name | role',
    });

    expect(tsx).toContain('>name</th>');
    expect(tsx).toContain('>role</th>');
  });

  test('imports the two helpers it actually uses', () => {
    const tsx = tsxOf({
      boundRows: '{{ queries.people.data.items }}',
      fields: 'name | role',
    });

    expect(tsx).toMatch(/import \{[^}]*\bcell\b[^}]*\} from '\.\.\/lib\/values'/);
    expect(tsx).toMatch(/import \{[^}]*\blist\b[^}]*\} from '\.\.\/lib\/values'/);
  });

  test('still emits the drag handle when the table is reorderable', () => {
    const tsx = tsxOf({
      boundRows: '{{ queries.people.data.items }}',
      fields: 'name',
      reorderable: true,
    });

    expect(tsx).toContain('data-grip=""');
    expect(tsx).toContain('SortableRows');
  });

  /**
   * The honest limit. Without a field list the generator cannot know what the columns are,
   * so it refuses and says so rather than inventing them from data it has never seen.
   */
  test('warns and emits nothing when the fields were not declared', () => {
    const { tsx, warnings } = generatePage(
      tablePage({ boundRows: '{{ queries.people.data.items }}', fields: '' }),
      DEFAULT_THEME,
    );

    expect(warnings.join(' ')).toContain('the table body is built from "rows"');
    expect(tsx).not.toContain('.map((row, index)');
  });

  test('a table typed out as text is unaffected', () => {
    const tsx = tsxOf({ rows: 'Ada | Owner\nGrace | Editor', fields: 'name | role' });

    expect(tsx).toContain('>Ada</td>');
    expect(tsx).not.toContain('.map((row, index)');
    expect(tsx).not.toContain('cell(row');
  });
});

describe('an empty bound table', () => {
  test('emits the empty message as a run-time check, since it cannot count rows', () => {
    const root = makeNode({ id: 'root', type: 'Box', name: 'Page', children: ['t1'] });
    const table = makeNode({
      id: 't1',
      type: 'Table',
      name: 'People',
      parentId: 'root',
      props: {
        columns: staticProp('Name'),
        fields: staticProp('name'),
        rows: exprProp('{{ queries.people.data.items }}'),
        reorderable: staticProp(false),
        emptyText: staticProp('Nobody yet.'),
      },
    });

    const { tsx } = generatePage(
      makePage({
        id: 'p',
        name: 'Home',
        path: '/',
        rootId: 'root',
        nodes: { root, t1: table },
        queries: [USERS],
      }),
      DEFAULT_THEME,
    );

    // The canvas shows this message for an empty array, so the export has to as well —
    // that agreement is what D6 is about.
    expect(tsx).toContain('list(queries.people.data.items).length === 0');
    expect(tsx).toContain('Nobody yet.');
  });
});
