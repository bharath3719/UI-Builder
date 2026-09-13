/**
 * Reading the shape of a captured API response.
 *
 * An endpoint keeps one real response (`sampleResponse`), and this is what turns it into
 * the two answers the studio needs: *where are the rows* and *what fields does a row
 * have*. Those are what let a table say "bind this column to `email`" instead of asking
 * someone to remember what the API returns.
 *
 * All of it is inspection of stored JSON — no evaluation, nothing user-authored is run.
 * A sample can be stale or absent, so every function here is total: it answers with an
 * empty list rather than throwing, and a caller renders "run the endpoint first".
 */

import type { Json } from './doc.js';

/** A `Json` that is a plain object, narrowed. */
function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * How deep to look for an array.
 *
 * Three levels covers `items`, `data.items` and `data.result.items`, which is every
 * envelope anyone actually ships. Unbounded recursion over an arbitrary response is a way
 * to spend a long time in a deeply nested document and then offer a list of paths too
 * long to choose from.
 */
const MAX_DEPTH = 3;

/**
 * How many rows to read when working out what fields exist.
 *
 * More than one, because APIs omit null fields and the first row is routinely the least
 * representative. Not all of them, because a sample can be thousands of rows and this
 * runs while someone is typing.
 */
const ROWS_SCANNED = 20;

/**
 * Every path in the sample whose value is an array, shallowest first.
 *
 * `''` means the response *is* the array, and it is offered like any other path so the
 * common case needs no special explanation in the UI. Shallowest first because the
 * outermost array is nearly always the one someone means — a nested `items[].tags` is a
 * real answer but a rare one, and it sorts below.
 */
export function arrayPaths(sample: Json | null | undefined): string[] {
  if (sample === null || sample === undefined) return [];

  const found: string[] = [];

  function walk(value: Json, path: string, depth: number): void {
    if (Array.isArray(value)) {
      found.push(path);
      return;
    }
    if (depth >= MAX_DEPTH || !isObject(value)) return;

    for (const [key, child] of Object.entries(value)) {
      walk(child, path === '' ? key : `${path}.${key}`, depth + 1);
    }
  }

  walk(sample, '', 0);

  // By depth, then alphabetically, so the order is stable between renders — a picker
  // whose options reshuffle is one nobody trusts.
  return found.sort((a, b) => {
    const depth = a.split('.').length - b.split('.').length;
    return depth !== 0 ? depth : a.localeCompare(b);
  });
}

/**
 * Follows a dotted path, with `''` meaning the value itself.
 *
 * Numeric segments index into arrays, so `data.0.id` works — the paths this produces
 * never contain one, but a path someone typed by hand might, and silently returning
 * undefined for a path that plainly resolves would be the more confusing behaviour.
 */
export function resolvePath(value: Json | null | undefined, path: string): Json | undefined {
  if (value === null || value === undefined) return undefined;
  if (path === '') return value;

  let current: Json | undefined = value;

  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (isObject(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * The rows a sample and a result path describe — `[]` when the path leads somewhere that
 * is not an array, which is exactly what a stale sample looks like after an API changes.
 */
export function rowsAt(sample: Json | null | undefined, resultPath: string): Json[] {
  const value = resolvePath(sample, resultPath);
  return Array.isArray(value) ? value : [];
}

/**
 * The field names a row has, in first-seen order across the rows scanned.
 *
 * First-seen rather than alphabetical, because an API's own field order is usually
 * meaningful — `id, name, email` is how someone thinks about the record, and sorting it
 * to `email, id, name` makes a column picker harder to scan, not easier.
 */
export function fieldsOf(rows: readonly Json[]): string[] {
  const fields: string[] = [];
  const seen = new Set<string>();

  for (const row of rows.slice(0, ROWS_SCANNED)) {
    if (!isObject(row)) continue;
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        fields.push(key);
      }
    }
  }

  return fields;
}

/**
 * A one-line preview of a value, for showing beside a field name.
 *
 * Truncated hard: this sits in a narrow column, and a field whose value is a paragraph
 * would push every other row off the panel.
 */
export function previewValue(value: Json | undefined, limit = 40): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string') return value.length > limit ? `${value.slice(0, limit)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;

  const json = JSON.stringify(value);
  return json.length > limit ? `${json.slice(0, limit)}…` : json;
}
