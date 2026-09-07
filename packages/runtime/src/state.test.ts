import type { StateVar } from '@ui-builder/schema';
import { describe, expect, it } from 'vitest';
import { resolveStateValues, stateReducer, type StateOverrides } from './state.js';

const COUNT: StateVar = { id: 'sv_count', name: 'count', type: 'number', initial: 0 };
const FLAG: StateVar = { id: 'sv_flag', name: 'flag', type: 'boolean', initial: false };
const ROWS: StateVar = { id: 'sv_rows', name: 'rows', type: 'json', initial: [] };

describe('resolveStateValues', () => {
  it('falls back to the declared initial when nothing has been written', () => {
    expect(resolveStateValues([COUNT, FLAG], {})).toEqual({ count: 0, flag: false });
  });

  it('keys the scope by name and the store by id', () => {
    expect(resolveStateValues([COUNT], { [COUNT.id]: 7 })).toEqual({ count: 7 });
  });

  it('keeps the value across a rename, because the store is keyed by id', () => {
    const written: StateOverrides = { [COUNT.id]: 7 };
    const renamed = { ...COUNT, name: 'total' };
    expect(resolveStateValues([renamed], written)).toEqual({ total: 7 });
  });

  it('shows an edited initial at once, because an unwritten variable has no entry', () => {
    expect(resolveStateValues([{ ...COUNT, initial: 42 }], {})).toEqual({ count: 42 });
  });

  it('ignores an override for a variable that has been deleted', () => {
    expect(resolveStateValues([COUNT], { [COUNT.id]: 7, [FLAG.id]: true })).toEqual({ count: 7 });
  });

  it('holds a written null rather than reverting to the initial', () => {
    expect(resolveStateValues([COUNT], { [COUNT.id]: null })).toEqual({ count: null });
  });

  it('is empty for a page with no variables', () => {
    expect(resolveStateValues([], {})).toEqual({});
  });
});

describe('stateReducer', () => {
  it('writes a value', () => {
    expect(stateReducer({}, { kind: 'set', id: COUNT.id, value: 3 })).toEqual({ [COUNT.id]: 3 });
  });

  it('returns the same object when the value is unchanged, so React bails out', () => {
    // A `setState` on every keystroke is common enough to be worth the identity check.
    const held: StateOverrides = { [COUNT.id]: 3 };
    expect(stateReducer(held, { kind: 'set', id: COUNT.id, value: 3 })).toBe(held);
  });

  it('does not treat a first write equal to the initial as a no-op', () => {
    // Nothing is written yet, so there is no held value to compare against.
    const next = stateReducer({}, { kind: 'set', id: COUNT.id, value: 0 });
    expect(next).toEqual({ [COUNT.id]: 0 });
  });

  it('leaves the other variables alone', () => {
    const held: StateOverrides = { [FLAG.id]: true };
    expect(stateReducer(held, { kind: 'set', id: COUNT.id, value: 1 })).toEqual({
      [FLAG.id]: true,
      [COUNT.id]: 1,
    });
  });

  it('toggles from the declared initial when nothing has been written', () => {
    expect(stateReducer({}, { kind: 'toggle', id: FLAG.id, initial: false })).toEqual({
      [FLAG.id]: true,
    });
  });

  it('makes two toggles in one handler two flips', () => {
    // The reason this is a reducer: through a stale render closure both would read the
    // same value and the second would undo nothing.
    const once = stateReducer({}, { kind: 'toggle', id: FLAG.id, initial: false });
    const twice = stateReducer(once, { kind: 'toggle', id: FLAG.id, initial: false });
    expect(once).toEqual({ [FLAG.id]: true });
    expect(twice).toEqual({ [FLAG.id]: false });
  });

  it('toggles with the truthiness rule the rest of the runtime uses', () => {
    // `isTruthy`: an empty array is falsy, a non-empty one is not.
    expect(stateReducer({}, { kind: 'toggle', id: ROWS.id, initial: [] })).toEqual({
      [ROWS.id]: true,
    });
    expect(stateReducer({}, { kind: 'toggle', id: ROWS.id, initial: [1] })).toEqual({
      [ROWS.id]: false,
    });
  });

  it('toggles a written value rather than the initial', () => {
    const held: StateOverrides = { [FLAG.id]: true };
    expect(stateReducer(held, { kind: 'toggle', id: FLAG.id, initial: false })).toEqual({
      [FLAG.id]: false,
    });
  });
});
