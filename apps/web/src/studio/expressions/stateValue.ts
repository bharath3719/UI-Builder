/**
 * Typed literals — how a state variable's declared type reads what was typed into a box.
 *
 * Shared by the two places a literal is entered against a type: a variable's initial
 * value in the data panel, and a `setState` step's value in the interactions tab. Written
 * once because the two must agree — a variable whose initial is the *string* `"0"` and
 * whose handler sets the *number* `0` is a page that changes type when you click it, and
 * every expression reading it has to cope with both.
 */

import type { Json, StateVar } from '@ui-builder/schema';

export type StateVarType = StateVar['type'];

/**
 * What a box shows for a stored value.
 *
 * `json` is stringified so an object is editable as the text it was typed as; everything
 * else is its own text. `null` shows as empty rather than as the word — an empty box is
 * what "nothing here" looks like, and typing the four letters back is not the way to set
 * it.
 */
export function formatStateValue(value: Json): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * What typed text means at a declared type.
 *
 * Deliberately total: every branch returns something storable, because this runs on a
 * field someone is still typing in and a half-written `{"a":` must not throw. The failure
 * mode is a value that is not yet what was meant, which the next keystroke fixes.
 */
export function parseStateValue(type: StateVarType, text: string): Json {
  const trimmed = text.trim();

  switch (type) {
    case 'number': {
      if (trimmed === '') return 0;
      const parsed = Number(trimmed);
      // A number variable holding "12a" would be coerced by every reader in a different
      // way. Zero is a number, which is what the type promised.
      return Number.isFinite(parsed) ? parsed : 0;
    }

    case 'boolean':
      // Only the word is true. A checkbox is what actually edits these; this branch
      // exists for the value arriving as text from anywhere else.
      return trimmed === 'true';

    case 'json': {
      if (trimmed === '') return null;
      try {
        return JSON.parse(trimmed) as Json;
      } catch {
        // Not valid JSON yet. Kept as the text so the edit is not thrown away
        // mid-keystroke; it becomes an object the moment the braces balance.
        return text;
      }
    }

    case 'string':
      return text;
  }
}

/**
 * The value a variable takes when its type changes under it.
 *
 * Converting rather than clearing, so switching `count` from string to number keeps the
 * 5 that was there. What cannot convert falls back to the type's empty value.
 */
export function coerceStateValue(type: StateVarType, value: Json): Json {
  switch (type) {
    case 'string':
      return formatStateValue(value);
    case 'number':
      return typeof value === 'number' ? value : parseStateValue('number', formatStateValue(value));
    case 'boolean':
      return typeof value === 'boolean' ? value : Boolean(value);
    case 'json':
      return value;
  }
}

/** The value a newly created variable of each type starts at. */
export const EMPTY_VALUE: Record<StateVarType, Json> = {
  string: '',
  number: 0,
  boolean: false,
  json: null,
};
