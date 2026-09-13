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

/**
 * Which of a set of options is the current one: the one that matches, or the first.
 *
 * `Tabs` is why the fallback is here rather than in the component — a tab strip with
 * nothing selected reads as broken, so one of them has to be current whatever the
 * `active` prop says, and the canvas and the export have to agree about which (D6).
 * `SideNav` deliberately does *not* use this: a nav whose current page is elsewhere
 * marks nothing, which is the truth.
 */
export function selectedOption(options: SelectOption[], active: string): SelectOption | undefined {
  return options.find((option) => option.value === active) ?? options[0];
}

/** One collapsible row of an `Accordion`: what the summary says, and what is under it. */
export interface Disclosure {
  title: string;
  body: string;
}

/**
 * `Title | Body` per line — the `Accordion` half of the trade `Select` and `Table` make
 * (PLAN.md §7): a list of questions and their answers is data.
 *
 * Not `parseOptions`, though the shape rhymes: a bare line there is *both* halves, which
 * for a disclosure would print the question again as its own answer. Here a bare line is
 * a title with nothing under it, and the empty body is what the summary-only row is.
 */
export function parseDisclosures(text: string): Disclosure[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('|');
      if (separator === -1) return { title: line, body: '' };
      return { title: line.slice(0, separator).trim(), body: line.slice(separator + 1).trim() };
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

/**
 * The same table, built from a bound array instead of typed text.
 *
 * This is what makes a `Table` a data component rather than a picture of one: `rows` is
 * bindable like every other prop, so `{{ queries.people.data.items }}` puts a real API
 * response in it — and `fields` says which key of each row belongs in which column.
 *
 * ## Why `fields` is separate from `columns`
 *
 * Because headings and field names are different things that happen to line up. "Full
 * name" is a heading; `name` is a key. Folding them into one `Name:name` syntax would make
 * a heading containing a colon unsayable, and would put a parsing rule between someone and
 * a column title. Two aligned lists cost one extra field and no rules.
 *
 * When `fields` is empty the row's own keys are used, in first-seen order, which is the
 * useful default for "just show me what came back".
 *
 * ## Values, not JSON
 *
 * A cell renders `stringifyCell`, not `JSON.stringify`: a field holding an object or an
 * array is a field someone has bound one level too high, and `[object Object]` in a cell
 * says that more clearly than a wall of braces that happens to fit.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** How a single field value reads in a cell. */
export function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(stringifyCell).join(', ');
  return '[object]';
}

/** `name | role` — the field list, split the same way a header line is. */
export function parseFields(fields: string): string[] {
  return fields
    .split('|')
    .map((field) => field.trim())
    .filter((field) => field !== '');
}

/**
 * The keys to read from each row: the ones named, or every key the rows actually have.
 *
 * Exported because codegen needs the identical answer — an export whose columns came out
 * in a different order from the canvas would be D6 broken for tables.
 */
export function tableFields(fields: string, rows: readonly unknown[]): string[] {
  const named = parseFields(fields);
  if (named.length > 0) return named;

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

/**
 * Builds the table from an array.
 *
 * A row that is not an object becomes a single cell holding it, so an array of strings —
 * a perfectly reasonable thing to bind — renders as a one-column table rather than as
 * nothing at all.
 */
export function tableFromData(
  columns: string,
  fields: string,
  data: readonly unknown[],
): TableData {
  const keys = tableFields(fields, data);

  const headers = columns
    .split('\n')[0]
    ?.split('|')
    .map((heading) => heading.trim())
    .filter(
      (heading, index, all) => !(heading === '' && (index === 0 || index === all.length - 1)),
    );

  const body = data.map((row) =>
    isRecord(row) ? keys.map((key) => stringifyCell(row[key])) : [stringifyCell(row)],
  );

  const width = Math.max(headers?.length ?? 0, keys.length, ...body.map((row) => row.length), 0);
  const pad = (row: string[]): string[] =>
    row.length === width ? row : [...row, ...Array<string>(width - row.length).fill('')];

  // Headings fall back to the field names, so binding a table to a response and choosing
  // nothing else still produces a table someone can read.
  const heading = headers && headers.length > 0 ? headers : keys;

  return {
    headers: heading.length === 0 ? [] : pad(heading),
    rows: body.map(pad),
    width,
  };
}

/**
 * The one entry point the renderer and the generator both use.
 *
 * `rows` is `unknown` because it is a bound prop: an array when someone bound a query to
 * it, a string when they typed one. Deciding which *here* rather than at each call site is
 * what keeps the canvas and the export agreeing about a table whose source changed shape.
 */
export function buildTable(columns: string, fields: string, rows: unknown): TableData {
  if (Array.isArray(rows)) return tableFromData(columns, fields, rows);
  return parseTable(columns, typeof rows === 'string' ? rows : '');
}
