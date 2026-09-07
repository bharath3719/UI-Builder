/**
 * Derivations a prop goes through on its way to the screen — the ones the renderer and
 * the code generator both have to perform, and therefore must not each own a copy of.
 *
 * A `Select`'s options are one string in the document and a list of `<option>`s in both
 * the canvas and the export; an `Avatar`'s fallback is a name in the document and two
 * initials in both. D6 says those two renderings agree, and the cheapest way to keep a
 * promise like that is to have one function to point at.
 *
 * Data only — like `spec.ts`, nothing here may reach for React or the DOM.
 */

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * `value | Label` per line; a bare line is both, and blank lines are skipped.
 *
 * A list of choices is data, so `Select` and `Radio` author theirs as text rather than
 * as child nodes (PLAN.md §7) — which makes this the parser standing between that text
 * and every surface those options appear on.
 */
export function parseOptions(text: string): SelectOption[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('|');
      if (separator === -1) return { value: line, label: line };
      const value = line.slice(0, separator).trim();
      return { value, label: line.slice(separator + 1).trim() || value };
    });
}

export interface TableData {
  /** Column headings, padded to `width`. Empty when the table was given no header line. */
  headers: string[];
  /** One array of cells per row, each padded to `width`. */
  rows: string[][];
  /** The column count. */
  width: number;
}

/**
 * One line per row, cells separated by `|` — the `Table` half of the trade `Select` and
 * `SideNav` make (PLAN.md §7): a grid of values is data, not forty nodes.
 *
 * A leading or trailing pipe is dropped rather than counted, so a table pasted out of
 * Markdown (`| Name | Role |`) arrives with the columns someone can see and not two empty
 * ones bracketing them. There is no escape for a literal `|` in a cell; a table that needs
 * one is a table that wants a data source, which is Phase 11's job rather than this
 * parser's.
 *
 * The width is the *widest* line rather than the header's, so a row with an extra cell
 * widens the table instead of having that cell silently dropped — a builder that eats
 * what you typed is worse than one that shows you a column you did not mean to make.
 * Everything shorter is padded, because a ragged `<tr>` is a broken table.
 */
export function parseTable(columns: string, rows: string): TableData {
  const cells = (line: string): string[] => {
    const trimmed = line.trim();
    const parts = trimmed.split('|');
    if (parts.length > 1 && trimmed.startsWith('|')) parts.shift();
    if (parts.length > 1 && trimmed.endsWith('|')) parts.pop();
    return parts.map((cell) => cell.trim());
  };

  const lines = (text: string): string[][] =>
    text
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map(cells);

  // Only the first line of `columns` is a header; the rest would be rows the author
  // typed into the wrong field, and inventing a second header row for them would hide
  // that rather than show it.
  const headers = lines(columns)[0] ?? [];
  const body = lines(rows);

  const width = Math.max(headers.length, ...body.map((row) => row.length), 0);
  const pad = (row: string[]): string[] =>
    row.length === width ? row : [...row, ...Array<string>(width - row.length).fill('')];

  return {
    headers: headers.length === 0 ? [] : pad(headers),
    rows: body.map(pad),
    width,
  };
}

/**
 * The first letter of each of the first two words — 'Ada Lovelace' becomes 'AL', and a
 * value that is already initials survives unchanged. The `Avatar` fallback.
 */
export function initialsOf(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => [...word][0]!.toUpperCase())
    .join('');
}
