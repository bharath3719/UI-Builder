/**
 * The one component in this library that also ships as *source* into an exported project.
 *
 * Everything else exports as static markup, which is why the emit templates can be inert
 * data (`emit.ts`). Rows a visitor can drag into a new order cannot: they need state and
 * event handlers, and a template vocabulary that could describe those would have become a
 * programming language. So `runtime.ts` carries this file as a string, `EmitModule` is how
 * a spec reaches for it, and `runtime.test.ts` asserts that the shipped copy is this code
 * — everything from the first import down — so that the two cannot drift.
 *
 * Deliberately a wrapper and nothing else: it renders no markup beyond the `tbody`, and
 * the rows, their cells and the handle inside each one all arrive as children, already
 * built. The canvas builds them in `Table.tsx` and the export builds them from the emit
 * template, so both agree about every element on the page (D6) and this component is only
 * ever responsible for what order they sit in. Anything that needed markup of its own
 * would have to come back through the template instead.
 */

import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

export interface SortableRowsProps {
  children?: ReactNode;
  className?: string;
  [attribute: string]: unknown;
}

type Row = ReactElement<Record<string, unknown>>;

function reorder(list: number[], from: number, to: number): number[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * A <tbody> whose rows can be dragged into a new order.
 *
 * A row is grabbed by its handle, or moved with the arrow keys while the handle has focus.
 * The handle is any descendant marked data-grip, which is the only thing this component
 * assumes about the markup it was handed. Keyboard reordering is not a courtesy: a
 * pointer-only control that changes what the page says is one a keyboard user cannot
 * operate at all, and it costs four lines.
 */
export function SortableRows({ children, ...rest }: SortableRowsProps) {
  const rows = Children.toArray(children).filter(isValidElement) as Row[];

  /** Row indices in the order they are shown. Empty until something has been moved. */
  const [order, setOrder] = useState<number[]>([]);
  /** Where the row being dragged currently sits, or null when nothing is being dragged. */
  const [held, setHeld] = useState<number | null>(null);

  // Derived, not synchronised in an effect: an order left over from a different number of
  // rows is not stale state to repair, it is an order that no longer describes anything.
  const current = order.length === rows.length ? order : rows.map((_, index) => index);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= current.length || to === from) return;
    setOrder(reorder(current, from, to));
  };

  const onDragStart = (position: number) => (event: DragEvent) => {
    setHeld(position);
    event.dataTransfer.effectAllowed = 'move';
    // Firefox refuses to start a drag whose transfer carries nothing at all.
    event.dataTransfer.setData('text/plain', '');
  };

  // The list rearranges as the pointer crosses each row rather than on drop, so the drag
  // shows the result instead of promising it. held follows the row it is holding.
  const onDragEnter = (position: number) => () => {
    if (held === null || held === position) return;
    move(held, position);
    setHeld(position);
  };

  const onKeyDown = (position: number) => (event: KeyboardEvent) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const target = event.target as Element | null;
    if (!target?.closest('[data-grip]')) return;
    event.preventDefault();
    move(position, position + (event.key === 'ArrowUp' ? -1 : 1));
  };

  return (
    // Without a dragover that prevents the default, the browser reports the whole table as
    // somewhere a row cannot go and shows the refusal cursor over every row of it.
    <tbody {...rest} onDragOver={(event) => event.preventDefault()}>
      {current.map((index, position) =>
        cloneElement(rows[index]!, {
          draggable: true,
          'data-dragging': held === position ? '' : undefined,
          onDragStart: onDragStart(position),
          onDragEnter: onDragEnter(position),
          onDragEnd: () => setHeld(null),
          onKeyDown: onKeyDown(position),
        }),
      )}
    </tbody>
  );
}
