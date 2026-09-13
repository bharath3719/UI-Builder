import { RESERVED_HEADERS, type ApiHeaders } from '@ui-builder/schema';

/**
 * Headers as an ordered list of pairs, which is what an editor needs.
 *
 * The stored shape is `Record<name, value>`, and editing a record directly makes two
 * ordinary edits impossible: clearing a name (the row vanishes mid-keystroke) and having
 * two blank rows at once (they collide on the empty key). So the editor's state is this,
 * and the record is derived from it on save.
 *
 * Separate from `HeadersEditor.tsx` so that file exports only components — a module that
 * mixes the two loses fast refresh for everything in it.
 */
export interface HeaderRow {
  name: string;
  value: string;
}

export function rowsFromHeaders(headers: ApiHeaders): HeaderRow[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

/**
 * Rows back to the stored shape. A row with no name is dropped rather than saved under
 * `''`: it is a row someone started and abandoned, and the server would refuse it anyway.
 * A later row of the same name wins, which matches what the object would have done.
 */
export function headersFromRows(rows: readonly HeaderRow[]): ApiHeaders {
  const headers: ApiHeaders = {};
  for (const row of rows) {
    if (row.name.trim() !== '') headers[row.name.trim()] = row.value;
  }
  return headers;
}

/** The client-side half of the server's rule, so a bad name is said before a save. */
export function headerProblem(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return undefined;
  if (RESERVED_HEADERS.has(trimmed.toLowerCase())) return 'This header is set automatically.';
  if (!/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/.test(trimmed)) return 'Not a valid header name.';
  return undefined;
}
