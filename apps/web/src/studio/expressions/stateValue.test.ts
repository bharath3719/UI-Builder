import { describe, expect, it } from 'vitest';
import { coerceStateValue, formatStateValue, parseStateValue } from './stateValue.js';

describe('formatStateValue', () => {
  it('shows a string as itself', () => {
    expect(formatStateValue('Ada')).toBe('Ada');
  });

  it('shows numbers and booleans as their text', () => {
    expect(formatStateValue(0)).toBe('0');
    expect(formatStateValue(false)).toBe('false');
  });

  it('shows null as an empty box, not as the word', () => {
    expect(formatStateValue(null)).toBe('');
  });

  it('stringifies an object so it can be edited as text', () => {
    expect(formatStateValue({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatStateValue([1, 2])).toBe('[\n  1,\n  2\n]');
  });
});

describe('parseStateValue', () => {
  it('keeps a string as typed, spaces included', () => {
    expect(parseStateValue('string', '  padded  ')).toBe('  padded  ');
  });

  it('reads a number', () => {
    expect(parseStateValue('number', '42')).toBe(42);
    expect(parseStateValue('number', ' -1.5 ')).toBe(-1.5);
  });

  it('gives a number variable a number even when the text is not one', () => {
    expect(parseStateValue('number', '')).toBe(0);
    expect(parseStateValue('number', '12a')).toBe(0);
  });

  it('reads a boolean from the word alone', () => {
    expect(parseStateValue('boolean', 'true')).toBe(true);
    expect(parseStateValue('boolean', 'false')).toBe(false);
    expect(parseStateValue('boolean', 'yes')).toBe(false);
  });

  it('parses json', () => {
    expect(parseStateValue('json', '{"a": 1}')).toEqual({ a: 1 });
    expect(parseStateValue('json', '[1, 2]')).toEqual([1, 2]);
    expect(parseStateValue('json', '')).toBeNull();
  });

  it('holds half-typed json as text rather than throwing it away', () => {
    // The field is edited a keystroke at a time; `{"a":` must survive to the next one.
    expect(parseStateValue('json', '{"a":')).toBe('{"a":');
  });
});

describe('coerceStateValue', () => {
  it('keeps a value that already fits', () => {
    expect(coerceStateValue('number', 5)).toBe(5);
    expect(coerceStateValue('string', 'Ada')).toBe('Ada');
    expect(coerceStateValue('boolean', true)).toBe(true);
  });

  it('carries a number across to a string and back', () => {
    expect(coerceStateValue('string', 5)).toBe('5');
    expect(coerceStateValue('number', '5')).toBe(5);
  });

  it('falls back to the type’s empty value when nothing converts', () => {
    expect(coerceStateValue('number', 'Ada')).toBe(0);
  });

  it('reads truthiness for a boolean', () => {
    expect(coerceStateValue('boolean', '')).toBe(false);
    expect(coerceStateValue('boolean', 'Ada')).toBe(true);
    expect(coerceStateValue('boolean', 0)).toBe(false);
  });

  it('leaves json alone, since anything is already json', () => {
    expect(coerceStateValue('json', { a: 1 })).toEqual({ a: 1 });
  });
});
