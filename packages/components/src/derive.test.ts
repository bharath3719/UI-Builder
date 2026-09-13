/**
 * `buildTable` is the one function the canvas, the preview and the export all call to turn
 * a `Table`'s props into cells, so these are the tests that keep the three agreeing (D6).
 */

import { describe, expect, it } from 'vitest';
import { buildTable } from './derive.js';

describe('buildTable, bound to an array', () => {
  const people = [
    { id: 1, name: 'Ada', role: 'Owner' },
    { id: 2, name: 'Grace', role: 'Editor' },
  ];

  it('maps named fields into the columns beside them', () => {
    const table = buildTable('Name | Role', 'name | role', people);

    expect(table.headers).toEqual(['Name', 'Role']);
    expect(table.rows).toEqual([
      ['Ada', 'Owner'],
      ['Grace', 'Editor'],
    ]);
  });

  it('reorders cells to match the field list, not the data', () => {
    const table = buildTable('Role | Name', 'role | name', people);

    expect(table.rows[0]).toEqual(['Owner', 'Ada']);
  });

  /** "Just show me what came back" has to produce something readable. */
  it('falls back to the rows own keys when no fields are named', () => {
    const table = buildTable('', '', people);

    expect(table.headers).toEqual(['id', 'name', 'role']);
    expect(table.rows[0]).toEqual(['1', 'Ada', 'Owner']);
  });

  it('unions keys across rows, so an omitted field still gets a column', () => {
    const table = buildTable('', '', [{ id: 1 }, { id: 2, nickname: 'Amazing Grace' }]);

    expect(table.headers).toEqual(['id', 'nickname']);
    expect(table.rows).toEqual([
      ['1', ''],
      ['2', 'Amazing Grace'],
    ]);
  });

  it('renders an array of plain values as one column', () => {
    const table = buildTable('Tag', '', ['alpha', 'beta']);

    expect(table.rows).toEqual([['alpha'], ['beta']]);
  });

  it('shows nothing for a null or missing field rather than the word null', () => {
    const table = buildTable('', 'name | missing', [{ name: 'Ada', other: null }]);

    expect(table.rows[0]).toEqual(['Ada', '']);
  });

  it('joins an array-valued field rather than printing JSON', () => {
    const table = buildTable('', 'tags', [{ tags: ['a', 'b'] }]);

    expect(table.rows[0]).toEqual(['a, b']);
  });

  /** A field bound one level too high should say so briefly, not fill the cell. */
  it('marks an object-valued field instead of dumping it', () => {
    const table = buildTable('', 'who', [{ who: { name: 'Ada' } }]);

    expect(table.rows[0]).toEqual(['[object]']);
  });

  it('still parses text when the prop was typed rather than bound', () => {
    const table = buildTable('Name | Role', '', 'Ada | Owner\nGrace | Editor');

    expect(table.rows).toEqual([
      ['Ada', 'Owner'],
      ['Grace', 'Editor'],
    ]);
  });

  /** A binding that has not resolved yet is `undefined`, and must render an empty table. */
  it.each([[undefined], [null], [42]])('treats the non-array, non-string %j as empty', (rows) => {
    expect(buildTable('Name', '', rows).rows).toEqual([]);
  });

  it('renders an empty array as a table with headings and no rows', () => {
    const table = buildTable('Name | Role', 'name | role', []);

    expect(table.headers).toEqual(['Name', 'Role']);
    expect(table.rows).toEqual([]);
  });
});
