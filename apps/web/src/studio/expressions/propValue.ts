/**
 * The two directions between a stored `PropValue` and the text a field shows.
 *
 * Apart from `ExpressionField.tsx` so that file exports only components — a module
 * mixing the two loses fast refresh for everything in it — and because this is the pair
 * of functions the whole "a literal and an expression are one field" rule actually lives
 * in (§10), which makes it worth being able to test on its own.
 */

import {
  exprProp,
  hasInterpolation,
  staticProp,
  type Json,
  type PropValue,
} from '@ui-builder/schema';

/** The text a stored value shows as. The inverse of `propOf`, and total. */
export function textOfProp(value: PropValue | undefined): string {
  if (!value) return '';
  if (value.kind === 'expr') return value.code;
  if (value.value === null) return '';
  return typeof value.value === 'string' ? value.value : JSON.stringify(value.value);
}

/**
 * What typed text becomes.
 *
 * Empty is `undefined` — no value at all — rather than an empty literal, so clearing a
 * field removes the condition or the argument instead of setting it to `""`.
 *
 * The `{{ }}` is the whole test. Nothing infers intent from what the text looks like: a
 * URL containing no hole is a URL, and one containing a hole is an expression, whatever
 * either happens to spell.
 */
export function propOf(
  text: string,
  parse: (text: string) => Json = asText,
): PropValue | undefined {
  if (text === '') return undefined;
  return hasInterpolation(text) ? exprProp(text) : staticProp(parse(text));
}

/** The default literal reading: the text, as text. */
export function asText(text: string): Json {
  return text;
}
