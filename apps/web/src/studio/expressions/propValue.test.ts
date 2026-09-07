import { exprProp, staticProp } from '@ui-builder/schema';
import { describe, expect, it } from 'vitest';
import { propOf, textOfProp } from './propValue.js';
import { parseStateValue } from './stateValue.js';

describe('textOfProp', () => {
  it('shows a literal string as itself', () => {
    expect(textOfProp(staticProp('/about'))).toBe('/about');
  });

  it('shows an expression as the source that was typed', () => {
    expect(textOfProp(exprProp('Hi {{ state.name }}'))).toBe('Hi {{ state.name }}');
  });

  it('shows nothing for no value', () => {
    expect(textOfProp(undefined)).toBe('');
    expect(textOfProp(staticProp(null))).toBe('');
  });

  it('shows a non-string literal as its json', () => {
    expect(textOfProp(staticProp(5))).toBe('5');
    expect(textOfProp(staticProp(true))).toBe('true');
    expect(textOfProp(staticProp({ a: 1 }))).toBe('{"a":1}');
  });
});

describe('propOf', () => {
  it('makes a literal from text with no hole in it', () => {
    expect(propOf('/about')).toEqual(staticProp('/about'));
  });

  it('makes an expression from text with one', () => {
    expect(propOf('{{ state.next }}')).toEqual(exprProp('{{ state.next }}'));
    expect(propOf('Hi {{ state.name }}')).toEqual(exprProp('Hi {{ state.name }}'));
  });

  it('clears the value when the field is emptied', () => {
    expect(propOf('')).toBeUndefined();
  });

  it('treats an unterminated hole as literal text, as the parser does', () => {
    // `parseTemplate` is total: half a typed expression is text until it closes.
    expect(propOf('{{ state.na')).toEqual(staticProp('{{ state.na'));
  });

  it('reads a literal at the target’s type when one is given', () => {
    expect(propOf('42', (text) => parseStateValue('number', text))).toEqual(staticProp(42));
    expect(propOf('true', (text) => parseStateValue('boolean', text))).toEqual(staticProp(true));
  });

  it('does not run the type reading on an expression', () => {
    // The value's type is whatever the expression evaluates to; coercing the *source*
    // would store the number 0 for `{{ state.count }}`.
    expect(propOf('{{ state.count }}', (text) => parseStateValue('number', text))).toEqual(
      exprProp('{{ state.count }}'),
    );
  });
});

describe('round trip', () => {
  it('returns a field to what was typed in it', () => {
    for (const source of ['/about', 'Hi {{ state.name }}', '{{ state.busy }}', 'plain']) {
      expect(textOfProp(propOf(source))).toBe(source);
    }
  });
});
