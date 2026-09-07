/**
 * The coercions a bound value goes through on its way onto the page.
 *
 * A prop the builder resolved while generating is written into the JSX as the word it
 * resolved to. A prop bound to an expression cannot be, so the coercion the canvas applied
 * to it is written out as one of these calls instead — which is why they exist and why
 * they are so small. Each one is the export's copy of a function in the builder itself:
 * text is stringifyValue, truthy is isTruthy, pick is asEnum, and so on down the file.
 *
 * That correspondence is checked rather than hoped for: values.test.ts in the generator
 * runs both copies of each rule over the same table of awkward values. So a binding shows
 * the same thing on the canvas and in this project, which is the promise the whole export
 * is built to keep.
 */

/**
 * Anything at all, as the text a page shows for it.
 *
 * Null and undefined are nothing rather than their own names: a heading bound to a field
 * that has not loaded yet should be empty, not the word undefined. Objects go through JSON
 * so a mistake is visible, since an interpolated [object Object] says nothing about what
 * was actually bound.
 */
export function text(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value) ?? '';
  } catch {
    // Circular, or something with a throwing toJSON. Both are authoring mistakes and
    // neither is worth taking the page down for.
    return '';
  }
}

/**
 * Whether a value counts as present.
 *
 * An empty array is empty, which plain truthiness disagrees with — and "show this when the
 * list has rows" is the most common condition there is, so getting that wrong would be
 * getting the common case wrong.
 */
export function truthy(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

export interface NumberShape {
  /** Counts are rounded and measurements are not. Defaults to rounding. */
  round?: boolean;
  min?: number;
}

export function num(value: unknown, fallback: number, shape: NumberShape = {}): number {
  // Null is "as if the prop were not set", not zero — which is what Number(null) makes
  // it, and what a binding reading a field that has not answered yet would then show.
  const numeric =
    value === undefined || value === null
      ? Number.NaN
      : typeof value === 'number'
        ? value
        : Number(value);
  const base = Number.isFinite(numeric) ? numeric : fallback;
  const shaped = shape.round === false ? base : Math.round(base);
  return shape.min === undefined ? shaped : Math.max(shape.min, shaped);
}

/**
 * One of a fixed set of words, or the default.
 *
 * Anything unrecognised falls back rather than being passed through, because these choose
 * a class or an attribute selector and a value nothing matches is an element with no style
 * at all.
 */
export function pick(value: unknown, allowed: readonly string[], fallback: string): string {
  const chosen = text(value);
  return allowed.includes(chosen) ? chosen : fallback;
}

/** The first letter of each of the first two words: 'Ada Lovelace' becomes 'AL'. */
export function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => [...word][0]!.toUpperCase())
    .join('');
}

/** The first character, uppercased, falling back to another value's. */
export function initial(value: string, or = ''): string {
  return ([...value.trim()][0] ?? [...or][0] ?? '?').toUpperCase();
}

/**
 * What a repeat iterates.
 *
 * An array is the answer nearly every time. A number is the other one worth having,
 * because "three of these" is a layout rather than a data source. Anything else repeats
 * nothing: a list bound to a request that has not answered yet is not an error, it is a
 * list that is still empty.
 *
 * The items are loose for the same reason the page's state is: they came out of a request
 * whose shape nothing here knows, and expressions written in the builder read them by
 * name. A project that will not compile is worse than one whose rows are not narrowed.
 */
export function list(value: unknown): any[] {
  if (Array.isArray(value)) return value as unknown[];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Array.from({ length: Math.floor(value) }, (_, index) => index);
  }
  return [];
}

/**
 * A class list, skipping the parts that are not there.
 *
 * A component in src/components takes a className from whoever placed it — that is the one
 * placement's own styling — and wears it alongside its own. Joining them by hand would put
 * a stray space in the attribute every time the caller passed nothing.
 */
export function cx(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
