/**
 * The two halves of a binding, checked against each other.
 *
 * A prop bound to an expression is coerced twice in this repo — once by the canvas, on its
 * way into a React component, and once by the exported project, in `src/lib/values.ts`. D6
 * says a node exports as what the canvas rendered, so those two have to agree about every
 * awkward value there is: a number on a text prop, an empty array in a condition, a word
 * that is not one of the options, a name with one word in it.
 *
 * They are separate code, in separate packages, for a reason that is not going away — one
 * of them ships to a stranger and must not import this repo. So this is the thing that
 * notices when they stop agreeing, and it notices by running both.
 *
 * The second half of the file is `runtime.test.ts`'s trick: the source that ships is a
 * string, and a string cannot be typechecked or executed, so it is compared against the
 * compiled twin the tests above actually ran.
 */

import { asEnum, coerceToProp, initialsOf, type PropSpec } from '@ui-builder/components';
import { isTruthy, stringifyValue } from '@ui-builder/schema';
import { describe, expect, test } from 'vitest';
import { initial, initials, list, num, pick, text, truthy } from './export/values.js';
import valuesSource from './export/values.ts?raw';
import { VALUES_MODULE } from './lib.js';

/** Everything an expression can hand a prop, including the shapes nobody means to. */
const AWKWARD: unknown[] = [
  undefined,
  null,
  '',
  'hello',
  0,
  1,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  true,
  false,
  [],
  [1, 2],
  {},
  { a: 1 },
];

const TEXT_PROP: PropSpec = { name: 'text', label: 'Text', type: 'string' };
const BOOL_PROP: PropSpec = { name: 'on', label: 'On', type: 'boolean' };
const NUMBER_PROP: PropSpec = { name: 'rows', label: 'Rows', type: 'number' };
const ENUM_PROP: PropSpec = {
  name: 'tone',
  label: 'Tone',
  type: 'enum',
  options: [
    { label: 'Default', value: 'default' },
    { label: 'Muted', value: 'muted' },
  ],
};

describe('the export agrees with the canvas about', () => {
  test('what a value looks like as text', () => {
    for (const value of AWKWARD) {
      // The canvas path: `coerceToProp` narrows a bound value toward the prop's declared
      // type, and the component's `asString` takes it from there. For a string prop that
      // is `stringifyValue`, with `undefined` meaning "as if unset".
      const onCanvas = stringifyValue(coerceToProp(value, TEXT_PROP) ?? '');
      expect(text(value), `text(${JSON.stringify(value) ?? 'undefined'})`).toBe(onCanvas);
    }
  });

  test('whether a value counts as present', () => {
    for (const value of AWKWARD) {
      const onCanvas = value === undefined || value === null ? false : isTruthy(value);
      expect(truthy(value), `truthy(${JSON.stringify(value) ?? 'undefined'})`).toBe(onCanvas);
    }
  });

  test('which of a fixed set of words a value is', () => {
    for (const value of AWKWARD) {
      const onCanvas = asEnum(coerceToProp(value, ENUM_PROP), ['default', 'muted'], 'default');
      expect(pick(value, ['default', 'muted'], 'default')).toBe(onCanvas);
    }
  });

  test('what a bound boolean prop resolves to', () => {
    for (const value of AWKWARD) {
      const coerced = coerceToProp(value, BOOL_PROP);
      const onCanvas = typeof coerced === 'boolean' ? coerced : false;
      expect(truthy(value)).toBe(onCanvas);
    }
  });

  test('what a bound number prop resolves to', () => {
    for (const value of AWKWARD) {
      const coerced = coerceToProp(value, NUMBER_PROP);
      // `expand.ts`'s own number rule, which is what the static side writes out.
      const raw = typeof coerced === 'number' && Number.isFinite(coerced) ? coerced : 2;
      expect(num(value, 2)).toBe(Math.round(raw));
      expect(num(value, 2, { round: false })).toBe(raw);
    }
  });

  test('the initials of a name', () => {
    for (const name of ['', ' ', 'Ada', 'Ada Lovelace', 'ada b lovelace', 'AL', '  spaced  out ']) {
      expect(initials(name)).toBe(initialsOf(name));
    }
  });
});

describe('the helpers themselves', () => {
  test('an unset value takes the fallback, and a present one never does', () => {
    // This is the whole difference between `asString(x, fallback)` and plain stringifying,
    // and it is what makes a cleared field show an Image's placeholder rather than nothing.
    expect(text(undefined, 'Untitled')).toBe('Untitled');
    expect(text(null, 'Untitled')).toBe('Untitled');
    expect(text('', 'Untitled')).toBe('');
    expect(truthy(undefined, true)).toBe(true);
    expect(truthy(false, true)).toBe(false);
  });

  test('an empty array is empty, which plain truthiness disagrees with', () => {
    expect(truthy([])).toBe(false);
    expect(Boolean([])).toBe(true);
  });

  test('a repeat over a count is that many indices, and over anything else is nothing', () => {
    expect(list([1, 2])).toEqual([1, 2]);
    expect(list(3)).toEqual([0, 1, 2]);
    expect(list(2.7)).toEqual([0, 1]);
    expect(list(0)).toEqual([]);
    expect(list(undefined)).toEqual([]);
    expect(list('two')).toEqual([]);
  });

  test('a first initial falls back to another value before it gives up', () => {
    expect(initial('Ada')).toBe('A');
    expect(initial('', 'Bee')).toBe('B');
    expect(initial('', '')).toBe('?');
  });

  test('a number is clamped after it is rounded, not before', () => {
    expect(num(0.4, 1, { min: 1 })).toBe(1);
    expect(num(9, 1, { min: 1, round: false })).toBe(9);
  });
});

describe('the shipped copy', () => {
  test('is the twin these tests ran, from the first export down', () => {
    // The file that reaches a user is the string in `lib.ts`; the file these tests import
    // is `export/values.ts`. Two copies that agree today are two copies that can stop, and
    // nothing else in the build would notice.
    const body = (source: string): string =>
      source.slice(source.indexOf('\nexport ') + 1).replace(/\r\n/g, '\n');

    // Only the file-level comment above the first export is allowed to differ, and it
    // does: the twin explains itself to someone reading this repo, and the shipped copy to
    // someone who has only ever seen their own project.
    expect(body(VALUES_MODULE.source)).toBe(body(valuesSource));
  });

  test('survives the literal it is stored in', () => {
    // A backtick would end the template literal and a dollar-brace would start an
    // interpolation, and both are syntax errors reported a long way from the cause.
    for (const module of [VALUES_MODULE]) {
      expect(module.source).not.toContain('`');
      expect(module.source).not.toContain('${');
    }
  });

  test('lands where its import specifier points', () => {
    // A page is `src/pages/<Name>.tsx`, so a specifier resolves against `src/pages/`.
    const resolved = new URL(VALUES_MODULE.specifier, 'file:///src/pages/').pathname.slice(1);
    expect(`${resolved}.ts`).toBe(VALUES_MODULE.path);
  });
});
