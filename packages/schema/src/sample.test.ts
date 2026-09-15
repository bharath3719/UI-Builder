import { describe, expect, it } from 'vitest';
import type { Json } from './doc.js';
import { arrayPaths, fieldsOf, previewValue, resolvePath, rowsAt } from './sample.js';

const envelope: Json = {
  meta: { total: 2 },
  data: { items: [{ id: 1, name: 'Ada' }], cursors: ['a', 'b'] },
};

describe('arrayPaths', () => {
  it('offers the empty path when the response is the array', () => {
    expect(arrayPaths([{ id: 1 }])).toEqual(['']);
  });

  it('finds arrays nested inside an envelope', () => {
    expect(arrayPaths(envelope)).toEqual(['data.cursors', 'data.items']);
  });

  it('puts shallower arrays first', () => {
    const sample: Json = { deep: { deeper: { rows: [] } }, rows: [] };

    expect(arrayPaths(sample)).toEqual(['rows', 'deep.deeper.rows']);
  });

  /** Unbounded recursion over an arbitrary response is a way to spend a long time. */
  it('stops looking past three levels', () => {
    const sample: Json = { a: { b: { c: { d: [1] } } } };

    expect(arrayPaths(sample)).toEqual([]);
  });

  it('finds an empty array, which is still where the rows go', () => {
    expect(arrayPaths({ items: [] })).toEqual(['items']);
  });

  it.each([[null], [undefined], ['a string' as Json], [42 as Json]])(
    'answers nothing for %j rather than throwing',
    (sample) => {
      expect(arrayPaths(sample)).toEqual([]);
    },
  );
});

describe('resolvePath', () => {
  it('returns the value itself for the empty path', () => {
    expect(resolvePath(envelope, '')).toBe(envelope);
  });

  it('follows a dotted path', () => {
    expect(resolvePath(envelope, 'meta.total')).toBe(2);
  });

  it('indexes into an array with a numeric segment', () => {
    expect(resolvePath(envelope, 'data.items.0.name')).toBe('Ada');
  });

  it.each([['missing'], ['meta.missing'], ['meta.total.deeper'], ['data.items.9.name']])(
    'answers undefined for the unresolvable path %j',
    (path) => {
      expect(resolvePath(envelope, path)).toBeUndefined();
    },
  );
});

describe('rowsAt', () => {
  it('returns the array a path leads to', () => {
    expect(rowsAt(envelope, 'data.items')).toEqual([{ id: 1, name: 'Ada' }]);
  });

  /** What a stale sample looks like once the API it came from changed shape. */
  it('returns nothing when the path no longer leads to an array', () => {
    expect(rowsAt(envelope, 'meta.total')).toEqual([]);
    expect(rowsAt(envelope, 'gone')).toEqual([]);
  });
});

describe('fieldsOf', () => {
  it('keeps the order the API used rather than sorting', () => {
    expect(fieldsOf([{ id: 1, name: 'Ada', email: 'a@b.c' }])).toEqual(['id', 'name', 'email']);
  });

  /** APIs omit null fields, so the first row is routinely the least representative. */
  it('unions fields across rows, appending ones seen later', () => {
    const rows: Json[] = [{ id: 1 }, { id: 2, nickname: 'Ada' }];

    expect(fieldsOf(rows)).toEqual(['id', 'nickname']);
  });

  it('reads at most twenty rows', () => {
    const rows: Json[] = Array.from({ length: 25 }, (_, index) => ({ [`f${index}`]: index }));

    expect(fieldsOf(rows)).toHaveLength(20);
  });

  it('skips rows that are not objects', () => {
    expect(fieldsOf(['a', 42, null, { id: 1 }])).toEqual(['id']);
  });
});

describe('previewValue', () => {
  it.each([
    [null, 'null'],
    [42, '42'],
    [true, 'true'],
    ['Ada', 'Ada'],
    [[1, 2, 3], '[3]'],
    [{ a: 1 }, '{"a":1}'],
  ])('renders %j as %j', (value, expected) => {
    expect(previewValue(value as Json)).toBe(expected);
  });

  it('truncates a long string', () => {
    expect(previewValue('x'.repeat(60))).toBe(`${'x'.repeat(40)}…`);
  });

  it('renders an absent value as nothing at all', () => {
    expect(previewValue(undefined)).toBe('');
  });
});
