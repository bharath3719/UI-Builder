import { parseTable } from '../derive.js';
import { asBoolean, asString } from '../spec.js';
import { SortableRows } from './SortableRows.js';
import type { RenderedProps } from './props.js';

export interface TableProps extends RenderedProps {
  /** The heading line — cells separated by `|`. Empty means a table with no header. */
  columns?: string;
  /** One row per line, cells separated by `|`. */
  rows?: string;
  caption?: string;
  /** Gives every row a handle and lets the reader drag them into a new order. */
  reorderable?: boolean;
  striped?: boolean;
  bordered?: boolean;
  compact?: boolean;
  /** What stands in the table's middle when there are no rows at all. */
  emptyText?: string;
  /**
   * Supplied by the renderer while editing. A table whose rows can be dragged would fight
   * the canvas for the same gesture, so the handles stay but the dragging does not.
   */
  readOnly?: boolean;
}

/**
 * A data table, authored as text.
 *
 * The same trade `Select`, `Radio` and `SideNav` make (PLAN.md §7), and the one this
 * component exists for: a grid of values is *data*. Forty cells assembled as forty nodes
 * would be forty things to select, style and keep aligned, and the shape of the table —
 * that every row has the same columns — would live nowhere and hold only by hand.
 *
 * `reorderable` is the one thing here that survives as behaviour rather than markup. The
 * rows are wrapped in `SortableRows`, which is also the component the export ships
 * (`runtime.ts`); every element inside it is built here, so the canvas, the preview and
 * the exported page render the same table and differ only in whether it can be dragged.
 */
export function Table({
  columns,
  rows,
  caption,
  reorderable,
  striped,
  bordered,
  compact,
  emptyText,
  className,
  children: _children,
  readOnly,
  ...rest
}: TableProps) {
  const data = parseTable(asString(columns), asString(rows));
  const title = asString(caption);
  const empty = asString(emptyText);

  // The handles are part of the design, so they are drawn wherever the table is. Only the
  // dragging is withheld while editing — a row that moved under the pointer on the canvas
  // would be a change the document never recorded.
  const grips = asBoolean(reorderable);
  const sortable = grips && !readOnly && data.rows.length > 0;

  const body = data.rows.map((cells, index) => (
    <tr key={index} className="ub-table-row">
      {grips ? (
        <td className="ub-table-grip-cell">
          <button type="button" className="ub-table-grip" data-grip="" aria-label="Reorder row" />
        </td>
      ) : null}
      {cells.map((cell, column) => (
        <td key={column} className="ub-table-cell">
          {cell}
        </td>
      ))}
    </tr>
  ));

  const placeholder =
    data.rows.length === 0 && empty ? (
      <tr className="ub-table-row">
        <td className="ub-table-empty" colSpan={Math.max(1, data.width + (grips ? 1 : 0))}>
          {empty}
        </td>
      </tr>
    ) : null;

  return (
    <table
      className={['ub-table', className].filter(Boolean).join(' ')}
      data-striped={asBoolean(striped) ? '' : undefined}
      data-bordered={asBoolean(bordered) ? '' : undefined}
      data-compact={asBoolean(compact) ? '' : undefined}
      {...rest}
    >
      {title ? <caption className="ub-table-caption">{title}</caption> : null}

      {data.headers.length > 0 ? (
        <thead className="ub-table-head">
          <tr className="ub-table-row">
            {/* An empty heading over the handles: naming a column of controls says
                nothing a reader of the table needs, in any medium. */}
            {grips ? <th className="ub-table-grip-cell" scope="col" /> : null}
            {data.headers.map((heading, column) => (
              <th key={column} className="ub-table-header" scope="col">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
      ) : null}

      {/* No class on the body: the sheet has nothing to say about it, and a class with
          no rule behind it is a promise to a stylesheet that never made one. */}
      {sortable ? (
        <SortableRows>{body}</SortableRows>
      ) : (
        <tbody>
          {body}
          {placeholder}
        </tbody>
      )}
    </table>
  );
}
