/**
 * Reading the answer to a DAX query.
 *
 * `POST /datasets/{id}/executeQueries` does not answer with rows. It answers with
 * `{ results: [{ tables: [{ rows: [...] }] }] }`, and every column in those rows is named
 * the way DAX names things — `Sales[Region]` for a column, `[Total]` for a measure. Both
 * facts are the protocol's, not the author's: a REST endpoint's envelope is a shape
 * somebody chose and `resultPath` exists to point through it, but nobody chose this one,
 * and there is no version of it a person would rather bind to. So a Power BI query's
 * `data` is the rows, with the qualifier off the front of each column.
 *
 * That is the one place in this product where a response is reshaped before a binding sees
 * it, and it is why this file is small and total: no throwing, no parsing of anything the
 * user wrote, and a result that is not the expected shape reads as no rows rather than as
 * an error, because a DAX statement that returns nothing is an ordinary thing.
 *
 * ## Written twice
 *
 * This file is also shipped verbatim into an exported project (`POWERBI_MODULE` in
 * `codegen/lib.ts`), because the export has to reshape the same response the same way or
 * the canvas and the build disagree about what a chart is plotting — D6. A test pins the
 * two copies together from the first export down. Keep it dependency-free and keep it free
 * of backticks and `${`: the other copy lives inside a template literal.
 */

/** One row of a result, keyed by column name. */
export type PowerBiRow = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Every row in the response, across every table of every result.
 *
 * We send one query, so in practice this is results[0].tables[0].rows — but "in
 * practice" is not a reason to index blindly. Reading them all means a response that
 * arrives split across tables produces all of its rows rather than silently the first
 * chunk, and the flat loop costs nothing to be right about.
 */
function rawRows(data: unknown): PowerBiRow[] {
  if (!isRecord(data)) return [];

  const results = data['results'];
  if (!Array.isArray(results)) return [];

  const rows: PowerBiRow[] = [];

  for (const result of results) {
    if (!isRecord(result)) continue;
    const tables = result['tables'];
    if (!Array.isArray(tables)) continue;

    for (const table of tables) {
      if (!isRecord(table)) continue;
      const tableRows = table['rows'];
      if (!Array.isArray(tableRows)) continue;

      for (const row of tableRows) {
        if (isRecord(row)) rows.push(row);
      }
    }
  }

  return rows;
}

/**
 * Sales[Region] becomes Region, [Total] becomes Total, and anything that is not
 * bracketed at all is already a name and is left alone.
 *
 * Only a *trailing* bracketed part is taken, and only when the brackets are balanced and
 * hold no brackets of their own — so a column genuinely called Rate [%] keeps its name
 * instead of becoming %.
 */
export function powerbiColumn(name: string): string {
  const open = name.indexOf('[');
  if (open === -1 || !name.endsWith(']')) return name;

  const inner = name.slice(open + 1, -1);
  if (inner === '' || inner.includes('[') || inner.includes(']')) return name;

  return inner;
}

/**
 * What each column of this result should be called.
 *
 * A short name that two columns would both claim — Sales[Amount] and Costs[Amount] in
 * one query — is given to neither: both keep the qualified name they came with. Dropping
 * one of them would make a chart plot a column nobody asked for, and picking a winner
 * would make *which* one depend on key order.
 */
function columnNames(rows: readonly PowerBiRow[]): Record<string, string> {
  const order: string[] = [];
  const seen = new Set<string>();

  // A tabular result gives every row the same columns, so the first row settles this. A
  // handful more costs nothing and covers a serializer that omits a null; all of them
  // would be a pass over a hundred thousand rows to learn what one row already said.
  for (const row of rows.slice(0, 20)) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      order.push(key);
    }
  }

  const claims = new Map<string, number>();
  for (const key of order) {
    const short = powerbiColumn(key);
    claims.set(short, (claims.get(short) ?? 0) + 1);
  }

  const names: Record<string, string> = {};
  for (const key of order) {
    const short = powerbiColumn(key);
    names[key] = claims.get(short) === 1 ? short : key;
  }
  return names;
}

/**
 * The rows of an executeQueries response, ready to bind a table or a chart to.
 *
 * Total by construction: anything that is not the expected shape produces no rows. A
 * query that fails does so as an HTTP status, which the caller already reports as the
 * query's error — this never has to decide whether an empty result is a failure.
 */
export function powerbiRows(data: unknown): PowerBiRow[] {
  const raw = rawRows(data);
  if (raw.length === 0) return [];

  const names = columnNames(raw);

  return raw.map((row) => {
    const out: PowerBiRow = {};
    for (const key of Object.keys(row)) {
      out[names[key] ?? key] = row[key];
    }
    return out;
  });
}
