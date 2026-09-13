/**
 * The modules an export ships alongside its markup.
 *
 * A string, for `css.ts`'s reason: this text has to reach three places no bundler sees
 * into — the studio's code panel in the browser, the API's zip route in Node, and a
 * snapshot test — and a plain string is the only form all three can take.
 *
 * There are two, and the bar for a third is high. Almost every component in this library
 * is markup, which is what lets the emit templates be inert data; the exceptions are the
 * two things a template cannot describe — a row someone can drag into a new order, and a
 * panel that is opened and closed — because both are state and event handlers. The rule
 * that keeps those exceptions from swallowing the design is in `EmitModule`: a module
 * named here wraps the markup a template already produced and adds behaviour to it, never
 * markup of its own. So the canvas and the export still render the same elements, from
 * the same template, and only the behaviour is written twice.
 *
 * Written twice, and *checked*: `runtime.test.ts` asserts each source below is its React
 * twin in `react/`, from the first import down. Only the file-level comment differs, and
 * deliberately — the copy in `react/` explains itself to someone reading this repo, and
 * the copy shipped in an export explains itself to someone who has never seen it.
 */

import type { EmitModule } from './emit.js';

export const SORTABLE_ROWS: EmitModule = {
  name: 'SortableRows',
  path: 'src/components/SortableRows.tsx',
  specifier: '../components/SortableRows',
  source: `/**
 * A table body whose rows the visitor can drag into a new order.
 *
 * It renders no markup of its own beyond the tbody: the rows, their cells and the handle
 * inside each one are all passed in as children by the page that uses it. So changing how
 * a row looks is a matter of editing that page, and nothing in this file needs to know
 * what a row contains.
 *
 * Reordering is local to the page — it moves the rows on screen and does not persist
 * anywhere. Wiring it to a data source means lifting the order out of this component and
 * saving it wherever the rows come from.
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
`,
};

export const OVERLAY: EmitModule = {
  name: 'Overlay',
  path: 'src/components/Overlay.tsx',
  specifier: '../components/Overlay',
  source: `/**
 * The dialog behaviour behind every modal and drawer in this project.
 *
 * Your pages decide what one looks like; this file decides what opening and closing one
 * means. It is generated, and editing it is safe — nothing regenerates it over you.
 */

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

export interface OverlayProps {
  /** Whether the overlay is on screen at all. */
  open?: boolean;
  /** Dismissal: the close button, the backdrop, or Escape. */
  onClose?: () => void;
  className?: string;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  [attribute: string]: unknown;
}

/**
 * A dialog stage that can be opened and closed.
 *
 * It renders no markup of its own: the element it draws is the one the page asked for,
 * carrying the class and the attributes it was given, and everything inside it — the
 * backdrop, the panel, the header, the body — is passed in as children. So what a modal
 * looks like is a matter of editing the page that uses it, and nothing in this file knows
 * what a modal contains.
 *
 * What it adds is the three things a dialog does that markup cannot. It is absent from the
 * document while closed, rather than hidden, so nothing inside it is focusable or read out.
 * It takes focus when it opens — and only when it *opens*, so a panel that is simply on the
 * page does not steal the caret on load. And it closes: a click on anything marked
 * data-close (the close button, and the backdrop when the panel may be dismissed), or
 * Escape while the panel may be dismissed.
 */
export function Overlay({
  open = true,
  onClose,
  className,
  children,
  onClick,
  onKeyDown,
  ...rest
}: OverlayProps) {
  const stage = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open && !wasOpen.current) stage.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (!open) return null;

  // Whether Escape and a click on the backdrop mean anything. Read off the attribute the
  // template already writes rather than taken as a prop of its own, so the answer is in
  // the markup both renderings share instead of in two places that pass it along.
  const dismissable = rest['data-dismissable'] !== undefined;

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    // Duck-typed rather than an instanceof check: on the canvas this renders inside an
    // iframe, which has its own Element constructor, and instanceof would be false for
    // every node in it.
    if (target && typeof (target as Element).closest === 'function') {
      if ((target as Element).closest('[data-close]')) onClose?.();
    }
    onClick?.(event);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && dismissable) {
      // Stopped, so one Escape closes one dialog rather than every dialog it is inside.
      event.stopPropagation();
      onClose?.();
    }
    onKeyDown?.(event);
  }

  return (
    <div
      ref={stage}
      className={className}
      // Focusable only as a target, never in the tab order: the stage is where Escape is
      // listened for, not a stop on the way to the panel's own controls.
      tabIndex={-1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}
`,
};
