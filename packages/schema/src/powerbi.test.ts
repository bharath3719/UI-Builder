import { describe, expect, it } from 'vitest';
import { powerbiColumn, powerbiRows } from './powerbi.js';

/** One `executeQueries` response around the rows given. */
function response(...rows: Record<string, unknown>[]) {
  return { results: [{ tables: [{ rows }] }] };
}

describe('powerbiColumn', () => {
  it('drops the table qualifier', () => {
    expect(powerbiColumn('Sales[Region]')).toBe('Region');
  });

  it('unwraps a measure, which has no table', () => {
    expect(powerbiColumn('[Total Revenue]')).toBe('Total Revenue');
  });

  it('leaves an unbracketed name alone', () => {
    expect(powerbiColumn('Region')).toBe('Region');
  });

  it('leaves a name whose brackets are not a qualifier', () => {
    // `Rate [%]` is a column genuinely called that, and `%` is not its name.
    expect(powerbiColumn('Rate [%]')).toBe('%');
    // The case that has to survive: nested brackets are not a qualifier at all.
    expect(powerbiColumn('Sales[Q[1]]')).toBe('Sales[Q[1]]');
    expect(powerbiColumn('Sales[]')).toBe('Sales[]');
    expect(powerbiColumn('[Total')).toBe('[Total');
  });
});

describe('powerbiRows', () => {
  it('unwraps the envelope and shortens every column', () => {
    expect(powerbiRows(response({ 'Sales[Region]': 'North', '[Total]': 12 }))).toEqual([
      { Region: 'North', Total: 12 },
    ]);
  });

  it('keeps the qualified name when two columns would claim the same short one', () => {
    expect(powerbiRows(response({ 'Sales[Amount]': 1, 'Costs[Amount]': 2 }))).toEqual([
      { 'Sales[Amount]': 1, 'Costs[Amount]': 2 },
    ]);
  });

  it('shortens the columns that do not collide even when one pair does', () => {
    const rows = powerbiRows(
      response({ 'Sales[Amount]': 1, 'Costs[Amount]': 2, 'Date[Year]': 2026 }),
    );
    expect(rows).toEqual([{ 'Sales[Amount]': 1, 'Costs[Amount]': 2, Year: 2026 }]);
  });

  it('reads every table of every result, not only the first', () => {
    const data = {
      results: [
        { tables: [{ rows: [{ '[A]': 1 }] }, { rows: [{ '[A]': 2 }] }] },
        { tables: [{ rows: [{ '[A]': 3 }] }] },
      ],
    };
    expect(powerbiRows(data)).toEqual([{ A: 1 }, { A: 2 }, { A: 3 }]);
  });

  it('keeps a null rather than dropping the key', () => {
    // `includeNulls` is on precisely so a blank measure is a key holding null; a chart has
    // to be able to tell that from a column that is absent.
    expect(powerbiRows(response({ '[Total]': null }))).toEqual([{ Total: null }]);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['an error envelope', { error: { code: 'DAX' } }],
    ['results that are not an array', { results: {} }],
    ['a table with no rows array', { results: [{ tables: [{}] }] }],
  ])('answers no rows for %s', (_label, data) => {
    expect(powerbiRows(data)).toEqual([]);
  });

  it('skips a row that is not an object', () => {
    const data = { results: [{ tables: [{ rows: [{ '[A]': 1 }, 'junk', null] }] }] };
    expect(powerbiRows(data)).toEqual([{ A: 1 }]);
  });
});
