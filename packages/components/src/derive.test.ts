/**
 * `buildTable` is the one function the canvas, the preview and the export all call to turn
 * a `Table`'s props into cells, so these are the tests that keep the three agreeing (D6).
 */

import { describe, expect, it } from 'vitest';
import { buildOptions, buildTable } from './derive.js';

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

describe('buildOptions, bound to an array', () => {
  it('reads the conventional keys when none are named', () => {
    const options = buildOptions([
      { id: 'a', name: 'Ada' },
      { id: 'g', name: 'Grace' },
    ]);

    expect(options).toEqual([
      { value: 'a', label: 'Ada' },
      { value: 'g', label: 'Grace' },
    ]);
  });

  it('prefers value over id, and label over name', () => {
    const options = buildOptions([{ value: 'v', id: 'i', label: 'L', name: 'N' }]);

    expect(options).toEqual([{ value: 'v', label: 'L' }]);
  });

  it('reads the fields it was told to', () => {
    const options = buildOptions([{ code: 'gb', title: 'United Kingdom' }], 'code', 'title');

    expect(options).toEqual([{ value: 'gb', label: 'United Kingdom' }]);
  });

  /** An array of strings is a perfectly reasonable thing to put in a dropdown. */
  it('treats a plain value as its own value and label', () => {
    expect(buildOptions(['alpha', 'beta'])).toEqual([
      { value: 'alpha', label: 'alpha' },
      { value: 'beta', label: 'beta' },
    ]);
  });

  it('falls back to the other half when a row has only one of them', () => {
    expect(buildOptions([{ name: 'Ada' }])).toEqual([{ value: 'Ada', label: 'Ada' }]);
    expect(buildOptions([{ id: 7 }])).toEqual([{ value: '7', label: '7' }]);
  });

  /** A row bound one level too high should not become a choice nobody can pick. */
  it('drops a row with neither a value nor a label', () => {
    expect(buildOptions([{ shape: { deep: true } }, { id: 'ok' }])).toEqual([
      { value: 'ok', label: 'ok' },
    ]);
  });

  it('still parses a typed list', () => {
    expect(buildOptions('a | A\nb | B')).toEqual([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);
  });

  it.each([[undefined], [null], [42]])('treats the non-array, non-string %j as empty', (value) => {
    expect(buildOptions(value)).toEqual([]);
  });
});
