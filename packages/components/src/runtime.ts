/**
 * The modules an export ships alongside its markup.
 *
 * A string, for `css.ts`'s reason: this text has to reach three places no bundler sees
 * into — the studio's code panel in the browser, the API's zip route in Node, and a
 * snapshot test — and a plain string is the only form all three can take.
 *
 * There are three, and the bar for a fourth is high. Almost every component in this
 * library is markup, which is what lets the emit templates be inert data; the exceptions
 * are the things a template cannot describe.
 *
 * Two of them are *behaviour*: a row someone can drag into a new order, and a panel that
 * is opened and closed. The rule that keeps those from swallowing the design is in
 * `EmitModule` — a module named here wraps the markup a template already produced and adds
 * behaviour to it, never markup of its own — so the canvas and the export still render the
 * same elements, from the same template, and only the behaviour is written twice.
 *
 * The third, `CHART`, is *shape*: five rows are five rects at coordinates nothing knows
 * until a query answers, so there is no markup for a wrapper to wrap. It is the one module
 * that draws its own, and what stands in for the shared template there is the test below,
 * which asks for more rather than less — not the same elements, the same code.
 *
 * Written twice, and *checked*: `runtime.test.ts` asserts each source below is its React
 * twin in `react/`, from the first import down. Only the file-level comment differs, and
 * deliberately — the copy in `react/` explains itself to someone reading this repo, and
 * the copy shipped in an export explains itself to someone who has never seen it.
 *
 * Each source is a template literal, so a **backslash in the code has to be doubled here**
 * — `'\\n'` below is the two characters the twin has, and writing it once would ship a
 * real newline inside a string literal instead. The same hazard as the backtick and the
 * `${` that test forbids, except that this one is legal and merely wrong, which is why it
 * is caught by the comparison rather than by a rule.
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

export const CHART: EmitModule = {
  name: 'Chart',
  path: 'src/components/Chart.tsx',
  specifier: '../components/Chart',
  source: `/**
 * The chart your pages draw their numbers with.
 *
 * It is generated, and editing it is safe — nothing regenerates it over you. Bars that
 * cluster, stack or fill the height, lines, areas, a pie or a donut; one series or several,
 * read from a column each or from the distinct values of one column. All of it is drawn
 * into an SVG that scales with its box, so there is nothing to measure and nothing to
 * install.
 *
 * Picking a mark calls onSelect with the row behind it. That is how a chart filters a
 * page: the handler puts the category into state, and anything reading that state — a
 * query's text included — follows.
 */

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';

/** One mark: a bar, a vertex of a line, a slice. */
export interface ChartPoint {
  /** The category the mark stands for. */
  label: string;
  value: number;
  /** Where the category sits on the axis, counting from zero. */
  index: number;
  /**
   * Which series the mark belongs to — the column it was read from, or the value of the
   * series field that produced it. Empty only for a series that was never named, which is
   * a hand-typed one.
   */
  series: string;
  seriesIndex: number;
  /** The row it was read from, or null when the series was typed in rather than bound. */
  row: Record<string, unknown> | null;
}

/**
 * One series, holding every category in the chart's order — including the ones it has
 * nothing for, as zero.
 *
 * That is what makes the drawing simple enough to be right: a stack needs the segment
 * below it and a cluster needs the slot beside it, and neither can be found by index if
 * two series disagree about how many points there are.
 */
export interface ChartSeries {
  name: string;
  index: number;
  points: ChartPoint[];
}

/** Everything the drawing needs, and the only thing that reads the author's data. */
export interface ChartData {
  categories: string[];
  series: ChartSeries[];
}

export interface ChartProps {
  /** One of KINDS. Anything else draws bars. */
  kind?: string;
  /**
   * The series: an array of rows when bound to a query, or Label | Value per line when
   * typed in. Unknown because a bound prop is whatever the expression evaluated to, and
   * buildChart is the one place that decides which of the two it got.
   */
  data?: unknown;
  /** Which key of each row is the category. */
  labelField?: string;
  /** Which key holds the number — or several, separated by commas, for one series each. */
  valueField?: string;
  /**
   * The key whose distinct values are the series, for a result with one row per category
   * *and* series rather than one column per series. Power BI's legend well.
   */
  seriesField?: string;
  /** Turns the bar family on its side. Meaningless to the others, which have an order. */
  horizontal?: boolean;
  /**
   * The colours the series take, in order, with a comma between them — any colour CSS
   * understands, a var() included.
   *
   * A shorter list than there are series replaces the front of the stylesheet's palette
   * and leaves the rest of it alone, so naming one colour recolours one series rather
   * than flattening the chart to a single colour. A longer one extends the cycle.
   */
  palette?: string;
  /**
   * The category currently filtered on. Marks that are not it are dimmed, which is what
   * makes a chart show the selection it caused rather than only send it.
   */
  selected?: string;
  showValues?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  /** What stands in the chart's place when the series is empty. */
  emptyText?: string;
  /**
   * Called with the mark the visitor picked.
   *
   * A chart with no handler draws no hit targets at all — no pointer cursor, nothing in
   * the tab order — which is also how it renders while it is being designed, and is why
   * this component needs no separate read-only mode.
   */
  onSelect?: (point: ChartPoint) => void;
  className?: string;
  [attribute: string]: unknown;
}

const KINDS = [
  'bar',
  'stacked',
  'stacked100',
  'line',
  'area',
  'stackedArea',
  'combo',
  'pie',
  'donut',
];

/**
 * The drawing is done in these units and scaled by the viewBox, so nothing here has to
 * measure an element — which on the canvas would mean measuring inside an iframe that
 * may not have painted yet.
 */
const VIEW_W = 320;
const VIEW_H = 180;

/**
 * The height of one row of the legend that runs *across* the top of a cartesian chart,
 * and so the gap between two of them once it wraps.
 */
const LEGEND_STEP = 12;

/**
 * The gap between two rows of the legend that runs *down* the side of a round one.
 *
 * Larger than the row above because it is the spacing a reader scans vertically, and
 * because this is the value the pie legend has always drawn at — a chart whose legend fits
 * must look exactly as it did before any of the fitting below existed.
 */
const LEGEND_COLUMN_STEP = 18;

/**
 * The tightest that column may be packed before it stops being readable.
 *
 * Past the number of rows this allows, the column says how many entries it left out rather
 * than drawing them off the bottom edge, where they are clipped and nothing admits it.
 */
const LEGEND_MIN_STEP = 11;

/**
 * The lowest a legend row may start.
 *
 * A row's own label sits eight units below its top, so this leaves that baseline clear of
 * the viewBox rather than flush against it.
 */
const LEGEND_BOTTOM = VIEW_H - 20;

/**
 * How many category colours the stylesheet defines.
 *
 * Colour encodes the *series* on a cartesian chart and the *category* on a round one, and
 * the difference is not a style choice: a bar chart's category axis already names every
 * bar, so colouring them would say a second time what the axis says once and leave nothing
 * for the dimming to mean. Parts of a whole have no axis, so there the marks genuinely
 * have nothing else telling them apart.
 */
const SERIES = 6;

/** Joins a series name to a category name to make one map key. */
const SEP = String.fromCharCode(0);

/**
 * The colours an author named, in order.
 *
 * Split on the commas *between* colours and not on the ones inside them: rgb(37, 99, 235)
 * is one colour, and a list a reader cannot write the commonest colour syntax into is a
 * list that will be written wrong. Depth is what tells the two apart, which also makes
 * var(--brand, #eee) survive.
 *
 * Exported so the studio can pin its own copy against it. This file is shipped whole into
 * a project and imports nothing but React, so the copy is not avoidable; two copies that
 * disagreed would be a swatch row that is not the chart beside it.
 */
export function splitColours(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);

    if (character === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  out.push(current);
  return out.map((colour) => colour.trim()).filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* The series                                                                  */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A cell read as a number. Thousands separators survive, so "1,200" is twelve hundred. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[\\s,]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** A cell read as a category. An object is not one, and prints as nothing. */
function toLabel(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Whether a typed-out cell is a number rather than a name. */
function isNumberText(text: string): boolean {
  const bare = text.replace(/[\\s,]/g, '');
  return bare !== '' && Number.isFinite(Number(bare));
}

/** "Actual, Target" is two columns; one name is one column; nothing is nothing. */
function fieldNames(value: string): string[] {
  return value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Which keys of a row are the category, the numbers, and the series.
 *
 * Named fields win. Otherwise every numeric key is a series and the first key that is not
 * one is the category — which is the shape a grouped query answers with, so a chart bound
 * straight to one draws without anything configured, and draws all of it rather than the
 * first column of it. A result whose columns are *all* numbers has no such key, and there
 * the first column is read as the axis, which is what a year or an hour usually is.
 */
function detectFields(
  rows: readonly unknown[],
  label: string,
  value: string,
  series: string,
): { label: string; values: string[]; series: string } {
  const first = rows.find(isRecord);
  const keys = first === undefined ? [] : Object.keys(first);
  const isNumeric = (key: string) => first !== undefined && typeof first[key] === 'number';

  const free = keys.filter((key) => key !== series);
  const numeric = free.filter(isNumeric);
  const words = free.filter((key) => !isNumeric(key));

  const named = fieldNames(value);
  const auto = words.length > 0 && numeric.length > 0 ? numeric : free.slice(1);

  let values = named.length > 0 ? named : auto;
  // A series column already says which series a row belongs to, so exactly one column can
  // hold the number; naming more would be asking one row to be in two series at once.
  if (series !== '' && values.length > 1) values = values.slice(0, 1);
  if (values.length === 0) values = free.slice(0, 1);

  const chosenLabel =
    label ||
    words.find((key) => !values.includes(key)) ||
    free.find((key) => !values.includes(key)) ||
    '';

  return { label: chosenLabel, values, series };
}

/**
 * Rows into series.
 *
 * A category that appears twice is added up rather than drawn twice. That is forced by
 * what a series field means — pivoting one is grouping by category, and two rows landing
 * in the same slot have to become one segment — and it is the right answer for the wide
 * case too: a result that was not fully grouped is one whose totals the author expected.
 */
function fromRows(
  rows: readonly unknown[],
  labelField: string,
  valueField: string,
  seriesField: string,
): ChartData {
  const fields = detectFields(rows, labelField, valueField, seriesField);
  // Empty only when no row was a record at all — an array of bare numbers, which is one
  // unnamed series of itself.
  const columns = fields.values.length > 0 ? fields.values : [''];

  const categories: string[] = [];
  const names: string[] = [];
  const seenCategory = new Set<string>();
  const seenName = new Set<string>();
  const cells = new Map<string, { value: number; row: Record<string, unknown> | null }>();

  const add = (name: string, label: string, value: number, row: Record<string, unknown> | null) => {
    if (!seenName.has(name)) {
      seenName.add(name);
      names.push(name);
    }
    if (!seenCategory.has(label)) {
      seenCategory.add(label);
      categories.push(label);
    }

    const cell = cells.get(name + SEP + label);
    // The first contributing row is the one kept, so a handler acting on an aggregate
    // still has something to act on. Which row it was is not a promise this can make.
    if (cell) cell.value += value;
    else cells.set(name + SEP + label, { value, row });
  };

  for (const raw of rows) {
    const row = isRecord(raw) ? raw : null;
    const label = row === null ? toLabel(raw) : toLabel(row[fields.label]);

    if (fields.series !== '' && row !== null) {
      add(toLabel(row[fields.series]), label, toNumber(row[columns[0]!]), row);
      continue;
    }

    for (const key of columns) {
      add(key, label, row === null ? toNumber(raw) : toNumber(row[key]), row);
    }
  }

  return {
    categories,
    series: names.map((name, index) => ({
      name,
      index,
      points: categories.map((label, position) => {
        const cell = cells.get(name + SEP + label);
        return {
          label,
          value: cell === undefined ? 0 : cell.value,
          index: position,
          series: name,
          seriesIndex: index,
          row: cell === undefined ? null : cell.row,
        };
      }),
    })),
  };
}

/**
 * A series typed out by hand.
 *
 * One line per category. A first line whose cells after the first are *not* numbers is
 * read as a heading naming the series, and every line is then split on every separator;
 * without one the block is a single series split on the last separator, so a category
 * with a pipe in it stays a category — which is likelier than a number with one.
 *
 * Positional, unlike the bound case: a label typed twice stays two marks, because what
 * someone typed out is what they meant to see.
 */
function fromText(text: string): ChartData {
  const lines = text
    .split('\\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { categories: [], series: [] };

  const head = lines[0]!.split('|').map((cell) => cell.trim());
  const headed =
    lines.length > 1 && head.length > 1 && head.slice(1).every((cell) => !isNumberText(cell));

  if (!headed) {
    const points = lines.map((line, index) => {
      const cut = line.lastIndexOf('|');
      return {
        label: cut === -1 ? line : line.slice(0, cut).trim(),
        value: cut === -1 ? 0 : toNumber(line.slice(cut + 1)),
        index,
        series: '',
        seriesIndex: 0,
        row: null,
      };
    });

    return {
      categories: points.map((point) => point.label),
      series: [{ name: '', index: 0, points }],
    };
  }

  const names = head.slice(1);
  const body = lines.slice(1).map((line) => line.split('|').map((cell) => cell.trim()));
  const categories = body.map((cells) => cells[0] ?? '');

  return {
    categories,
    series: names.map((name, index) => ({
      name,
      index,
      points: categories.map((label, position) => ({
        label,
        value: toNumber(body[position]![index + 1] ?? ''),
        index: position,
        series: name,
        seriesIndex: index,
        row: null,
      })),
    })),
  };
}

/**
 * The chart to draw.
 *
 * Both authored forms end here, for the reason buildTable says: deciding which one was
 * given at the single place that reads it is what keeps a chart whose source changed
 * shape rendering the same in both places.
 */
export function buildChart(
  data: unknown,
  labelField: string,
  valueField: string,
  seriesField: string,
): ChartData {
  if (Array.isArray(data)) return fromRows(data, labelField, valueField, seriesField);
  return fromText(typeof data === 'string' ? data : '');
}

/* -------------------------------------------------------------------------- */
/* Scales                                                                      */
/* -------------------------------------------------------------------------- */

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function trimmed(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * 1200 reads as 1.2k.
 *
 * Hand-rolled rather than Intl.NumberFormat, which formats by locale: an axis that says
 * 1,2k for one reader and 1.2k for another is an axis whose exported copy and whose
 * canvas can disagree about what they say.
 */
function formatValue(value: number): string {
  const size = Math.abs(value);
  if (size >= 1e9) return trimmed(value / 1e9) + 'B';
  if (size >= 1e6) return trimmed(value / 1e6) + 'M';
  if (size >= 1e3) return trimmed(value / 1e3) + 'k';
  return trimmed(value);
}

/** A share of a whole, which is the only thing a 100% stacked chart's axis measures. */
function formatShare(value: number): string {
  return Math.round(value * 100) + '%';
}

/** A round step near span/count — one, two, five or ten times a power of ten. */
function niceStep(span: number, count: number): number {
  if (!(span > 0)) return 1;
  const rough = span / count;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / power;
  return (scaled > 5 ? 10 : scaled > 2 ? 5 : scaled > 1 ? 2 : 1) * power;
}

function ticksBetween(low: number, high: number, count: number): number[] {
  const step = niceStep(high - low, count);
  const out: number[] = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high + step / 1000; tick += step) {
    // Re-rounded each time: adding a step repeatedly drifts, and an axis labelled
    // 0.30000000000000004 is a rendering fault the reader has to interpret.
    out.push(Math.round(tick / step) * step);
  }
  return out;
}

/** Where one mark begins and ends on the value axis. */
interface Span {
  from: number;
  to: number;
}

/**
 * What each mark spans on the value axis.
 *
 * The whole of the difference between clustered, stacked and 100% stacked is here, and
 * everything downstream draws a from and a to without knowing which of the three it is
 * drawing — which is why turning the bars sideways did not have to be written again for
 * each of them.
 *
 * Negatives stack downward from zero rather than eating into the positive part of the
 * stack, which is the only reading under which the segments still sum to the bar.
 */
function spansOf(series: readonly ChartSeries[], count: number, mode: string): Span[][] {
  const spans: Span[][] = series.map(() => []);

  const totals: number[] = new Array(count).fill(0);
  if (mode === 'full') {
    for (const one of series) {
      one.points.forEach((point, index) => {
        totals[index] = (totals[index] ?? 0) + Math.abs(point.value);
      });
    }
  }

  const up: number[] = new Array(count).fill(0);
  const down: number[] = new Array(count).fill(0);

  series.forEach((one, lane) => {
    one.points.forEach((point, index) => {
      if (mode === 'grouped') {
        spans[lane]![index] = { from: 0, to: point.value };
        return;
      }

      const total = totals[index] ?? 0;
      const value =
        mode === 'full' ? (total === 0 ? 0 : Math.abs(point.value) / total) : point.value;

      if (value < 0) {
        const from = down[index] ?? 0;
        down[index] = from + value;
        spans[lane]![index] = { from, to: from + value };
      } else {
        const from = up[index] ?? 0;
        up[index] = from + value;
        spans[lane]![index] = { from, to: from + value };
      }
    });
  });

  return spans;
}

/**
 * The value axis, always including zero.
 *
 * A bar chart whose axis starts somewhere else exaggerates every difference on it, which
 * is the one charting decision that can make a page lie. A series that is all zeroes still
 * gets a height, or there would be nothing to divide by.
 */
function domainOf(spans: readonly Span[][]): { low: number; high: number } {
  let low = 0;
  let high = 0;

  for (const lane of spans) {
    for (const span of lane) {
      low = Math.min(low, span.from, span.to);
      high = Math.max(high, span.from, span.to);
    }
  }

  return low === high ? { low, high: high + 1 } : { low, high };
}

/* -------------------------------------------------------------------------- */
/* Slices                                                                      */
/* -------------------------------------------------------------------------- */

/** A point on a circle, with the turn measured clockwise from twelve o'clock. */
function polar(cx: number, cy: number, radius: number, turn: number): { x: number; y: number } {
  const angle = (turn - 0.25) * Math.PI * 2;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

/** A closed ring, drawn as two half arcs. */
function ringPath(cx: number, cy: number, radius: number, sweep: number): string {
  const top = polar(cx, cy, radius, 0);
  const bottom = polar(cx, cy, radius, 0.5);
  return [
    'M',
    round(top.x),
    round(top.y),
    'A',
    radius,
    radius,
    0,
    0,
    sweep,
    round(bottom.x),
    round(bottom.y),
    'A',
    radius,
    radius,
    0,
    0,
    sweep,
    round(top.x),
    round(top.y),
    'Z',
  ].join(' ');
}

/** One slice, hollow when inner is above zero. */
function arcPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  from: number,
  to: number,
): string {
  const span = Math.min(1, Math.max(0, to - from));

  // An arc from a point back to itself draws nothing, so a series with one category — or
  // with one category holding all of the total — is drawn as a ring instead. The hole is
  // a second ring wound the other way, which leaves it empty under either fill rule.
  if (span >= 1) {
    const outside = ringPath(cx, cy, outer, 1);
    return inner > 0 ? outside + ' ' + ringPath(cx, cy, inner, 0) : outside;
  }

  const large = span > 0.5 ? 1 : 0;
  const startOuter = polar(cx, cy, outer, from);
  const endOuter = polar(cx, cy, outer, to);

  if (inner <= 0) {
    return [
      'M',
      round(cx),
      round(cy),
      'L',
      round(startOuter.x),
      round(startOuter.y),
      'A',
      outer,
      outer,
      0,
      large,
      1,
      round(endOuter.x),
      round(endOuter.y),
      'Z',
    ].join(' ');
  }

  const endInner = polar(cx, cy, inner, to);
  const startInner = polar(cx, cy, inner, from);
  return [
    'M',
    round(startOuter.x),
    round(startOuter.y),
    'A',
    outer,
    outer,
    0,
    large,
    1,
    round(endOuter.x),
    round(endOuter.y),
    'L',
    round(endInner.x),
    round(endInner.y),
    'A',
    inner,
    inner,
    0,
    large,
    0,
    round(startInner.x),
    round(startInner.y),
    'Z',
  ].join(' ');
}

/* -------------------------------------------------------------------------- */
/* The chart                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A chart drawn from a series the page already has.
 *
 * Clustered, stacked or 100% stacked bars, standing or lying down; a line, an area or
 * stacked areas; bars with a line over them; a pie or a donut. Many series or one, read
 * either from a column each or from the distinct values of a series field — which are the
 * two shapes a query answers with, and Power BI's Values and Legend wells.
 *
 * Everything here is in service of the click. Picking a mark calls onSelect with the row
 * behind it, so the handler can put the category into page state. Queries whose text reads
 * that state re-run, and the chart is handed the category back as selected, which dims
 * everything it is not.
 *
 * There is one value axis. A combo chart draws its lines against the same scale as its
 * bars, so the two are comparable rather than merely adjacent — a second axis can be
 * scaled to put any line above any bar, which is a way to draw a relationship that is not
 * in the numbers.
 */
export function Chart({
  kind = 'bar',
  data,
  labelField = '',
  valueField = '',
  seriesField = '',
  horizontal = false,
  palette = '',
  selected = '',
  // These default to off rather than to what a new chart shows, and the spec's
  // defaultProps decide that instead. An attribute React would be handed as false is an
  // attribute the generator omits, so a parameter default of true would be a chart that
  // exported with a grid the canvas had none of.
  showValues = false,
  showGrid = false,
  showLegend = false,
  emptyText = '',
  onSelect,
  className,
  children: _children,
  ...rest
}: ChartProps) {
  const shape = KINDS.indexOf(kind) === -1 ? 'bar' : kind;
  const chart = buildChart(data, labelField, valueField, seriesField);
  const classes = ['ub-chart', className].filter(Boolean).join(' ');

  const colours = splitColours(palette);
  // A named list shorter than the stylesheet's palette replaces the front of it rather
  // than becoming the whole cycle, so one colour recolours one series. A longer one
  // lengthens the cycle, because the seventh slot has no rule in the stylesheet and would
  // otherwise wrap back to the first colour while the author is still naming new ones.
  const cycle = Math.max(colours.length, SERIES);

  /**
   * What gives a mark its colour: the slot the stylesheet colours it from, and the
   * author's own colour for that slot when they named one.
   *
   * The colour is set as the custom property the stylesheet already reads, inline, where
   * it outranks the [data-series] rule that would otherwise set it. The cast is because
   * React types a style object as known CSS properties and a custom property is not one —
   * it passes them through regardless, and this is the one way to say so.
   */
  const paint = (index: number): { 'data-series': number; style?: CSSProperties } => {
    const slot = index % cycle;
    const colour = colours[slot];
    return {
      'data-series': slot,
      style: colour === undefined ? undefined : ({ '--ub-chart-mark': colour } as CSSProperties),
    };
  };

  /** Dimmed when something is filtered on and this category is not it. */
  const dim = (label: string) => (selected !== '' && label !== selected ? '' : undefined);
  const dimmed = (point: ChartPoint) => dim(point.label);

  /** What a mark says when it is pointed at or read out. */
  const describe = (point: ChartPoint) =>
    (chart.series.length > 1 && point.series !== '' ? point.series + ' · ' : '') +
    point.label +
    ': ' +
    formatValue(point.value);

  /**
   * What a mark is wrapped in. Without a handler it is wrapped in nothing at all, so a
   * chart nobody wired up has no focus stops and no pointer cursor to promise one.
   */
  const hit = (key: string, point: ChartPoint, drawn: ReactNode) => {
    if (!onSelect) return drawn;
    const press = (event: KeyboardEvent<SVGGElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelect(point);
    };
    return (
      // The key rides on the wrapper as well as on the mark inside it, because which of
      // the two is the array element depends on whether this chart was wired up.
      <g
        key={key}
        className="ub-chart-hit"
        role="button"
        tabIndex={0}
        aria-label={describe(point)}
        onClick={() => onSelect(point)}
        onKeyDown={press}
      >
        {drawn}
      </g>
    );
  };

  if (chart.categories.length === 0 || chart.series.length === 0) {
    return (
      <div className={classes} {...rest}>
        {emptyText ? <p className="ub-chart-empty">{emptyText}</p> : null}
      </div>
    );
  }

  if (shape === 'pie' || shape === 'donut') {
    // Parts of one whole, so parts of one series: a second one would be a second whole,
    // and two pies in a frame is two charts rather than one that can say anything.
    const points = chart.series[0]!.points;

    // Shares are taken over magnitudes: a negative in a series being shown as parts of a
    // whole is already a question the chart cannot answer, and this at least draws it.
    const total = points.reduce((sum, point) => sum + Math.abs(point.value), 0);
    const cx = showLegend ? 92 : VIEW_W / 2;
    const cy = VIEW_H / 2;
    const outer = 72;
    const inner = shape === 'donut' ? 40 : 0;

    /*
     * The legend is a column beside the pie and the viewBox is fixed, so a series with more
     * categories than fit has to be fitted rather than drawn past the bottom edge, where it
     * was being silently clipped from about the ninth category on.
     *
     * Spacing tightens to whatever fits, down to a floor below which the labels touch. Past
     * that the column is truncated and the slot that would have held the next colour says
     * how many are missing instead: a count the reader can act on, where a colour they
     * cannot match to anything is worse than nothing at all.
     */
    const legendTop = 34;
    const legendRoom = LEGEND_BOTTOM - legendTop;
    const legendFits = Math.floor(legendRoom / LEGEND_MIN_STEP) + 1;
    const legendShown = points.length <= legendFits ? points.length : Math.max(1, legendFits - 1);
    const legendHidden = points.length - legendShown;
    const legendRows = legendShown + (legendHidden > 0 ? 1 : 0);
    // The spacing it has always used, until there are too many rows for that to fit — at
    // which point the column closes up to exactly the room available and no further.
    const legendStep =
      legendRows > 1
        ? Math.min(LEGEND_COLUMN_STEP, legendRoom / (legendRows - 1))
        : LEGEND_COLUMN_STEP;

    let turn = 0;
    const slices = points.map((point) => {
      const share = total === 0 ? 1 / points.length : Math.abs(point.value) / total;
      const from = turn;
      turn += share;
      return { point, share, path: arcPath(cx, cy, outer, inner, from, turn) };
    });

    return (
      <div className={classes} {...rest}>
        <svg
          className="ub-chart-plot"
          viewBox={'0 0 ' + VIEW_W + ' ' + VIEW_H}
          preserveAspectRatio="xMidYMid meet"
          role="img"
        >
          {slices.map((slice) =>
            hit(
              'slice-' + slice.point.index,
              slice.point,
              <path
                key={slice.point.index}
                className="ub-chart-slice"
                d={slice.path}
                {...paint(slice.point.index)}
                data-dim={dimmed(slice.point)}
              >
                <title>{slice.point.label + ': ' + formatValue(slice.point.value)}</title>
              </path>,
            ),
          )}

          {showValues && inner > 0 ? (
            <text className="ub-chart-total" x={cx} y={cy} textAnchor="middle">
              {formatValue(points.reduce((sum, point) => sum + point.value, 0))}
            </text>
          ) : null}

          {showLegend
            ? points.slice(0, legendShown).map((point, row) => (
                <g
                  key={point.index}
                  transform={'translate(190 ' + round(legendTop + row * legendStep) + ')'}
                >
                  <rect
                    className="ub-chart-key"
                    width={9}
                    height={9}
                    rx={2}
                    {...paint(point.index)}
                    data-dim={dimmed(point)}
                  />
                  <text className="ub-chart-label" x={15} y={8}>
                    {point.label}
                    {showValues ? ' · ' + formatValue(point.value) : ''}
                  </text>
                </g>
              ))
            : null}

          {showLegend && legendHidden > 0 ? (
            <text
              className="ub-chart-label"
              x={190}
              y={round(legendTop + legendShown * legendStep + 8)}
            >
              {'+' + legendHidden + ' more'}
            </text>
          ) : null}
        </svg>
      </div>
    );
  }

  /* ---- what is being drawn ---- */

  const bars = shape === 'bar' || shape === 'stacked' || shape === 'stacked100';
  const mode =
    shape === 'stacked' || shape === 'stackedArea'
      ? 'stacked'
      : shape === 'stacked100'
        ? 'full'
        : 'grouped';
  const grouped = mode === 'grouped';
  const full = mode === 'full';

  // A combo is bars for the first series and a line for each of the rest — the one kind
  // whose marks are not all alike, and the reason these are two lists rather than a flag.
  // Orientation belongs to the bar family alone: a line read bottom-to-top is a line whose
  // reader has to turn the page.
  const barSeries = shape === 'combo' ? chart.series.slice(0, 1) : bars ? chart.series : [];
  const lineSeries = shape === 'combo' ? chart.series.slice(1) : bars ? [] : chart.series;
  const sideways = horizontal && bars;

  const count = chart.categories.length;
  const spans = spansOf(chart.series, count, mode);
  const span = domainOf(spans);
  const format = full ? formatShare : formatValue;

  /* ---- where it goes ---- */

  // The category labels change sides with the bars, and so does the room kept for them.
  const padLeft = sideways ? 58 : 36;
  const padRight = sideways ? 14 : 8;
  const padBottom = sideways ? 20 : 24;

  /*
   * Laid out by counting characters, because laying it out by measuring text means
   * measuring an element, and this whole component is written so as never to touch one.
   *
   * Wrapped onto as many rows as it takes. A single row ran off the right edge and was
   * clipped from about the fifth series name on — and since the plot's top padding has to
   * make room for however many rows there turn out to be, the layout has to happen up here
   * rather than beside the markup that draws it.
   */
  const keys: { name: string; index: number; x: number; row: number }[] = [];
  let legendRows = 1;

  if (showLegend) {
    const right = VIEW_W - padRight;
    let x = padLeft;
    let row = 0;

    for (const one of chart.series) {
      const width = 13 + Math.max(1, one.name.length) * 4.7 + 9;
      // Never wrapped on the first key of a row: one name wider than the whole plot would
      // wrap for ever, and clipping that name is better than not returning.
      if (x > padLeft && x + width > right) {
        row += 1;
        x = padLeft;
      }
      keys.push({ name: one.name, index: one.index, x, row });
      x += width;
    }

    legendRows = row + 1;
  }

  // 26 for one row, which is what a one-row legend always had, and a row's height for each
  // one after it.
  const padTop = showLegend ? 14 + legendRows * LEGEND_STEP : 10;

  const plotX = padLeft;
  const plotY = padTop;
  const plotW = VIEW_W - padLeft - padRight;
  const plotH = VIEW_H - padTop - padBottom;

  const band = (sideways ? plotH : plotW) / count;
  const bandAt = (index: number) => (sideways ? plotY : plotX) + band * index;
  const centre = (index: number) => bandAt(index) + band / 2;

  const at = (value: number) =>
    sideways
      ? plotX + plotW * ((value - span.low) / (span.high - span.low))
      : plotY + plotH * (1 - (value - span.low) / (span.high - span.low));

  // Zero is always inside the domain — every span either starts there or stacks away from
  // it — so this is the axis rather than a clamped approximation of it.
  const base = at(0);

  // Most of the band, capped and centred, and shared out between the series standing side
  // by side: uncapped, a chart of two categories is two slabs, and a fixed width leaves a
  // chart of twenty overlapping.
  const lanes = grouped ? Math.max(1, barSeries.length) : 1;
  const inner = Math.min(band * 0.72, 56 * lanes);
  const lane = inner / lanes;
  const thickness = Math.max(1, lane - (lanes > 1 ? 1 : 0));
  // Only a cluster moves its series across the band. A stack keeps every segment in the
  // same slot and separates them along the *value* axis instead, which is the whole of
  // what makes it a stack rather than a row.
  const laneAt = (index: number, slot: number) =>
    bandAt(index) + (band - inner) / 2 + lane * (grouped ? slot : 0);

  // Every category is labelled while they fit, and one in every nth after that. Dropping
  // labels is better than overlapping them, and better than rotating them: a reader can
  // count along a bar chart, and cannot read text lying on its side.
  const every = Math.ceil(count / (sideways ? 9 : 8));

  /* ---- the marks ---- */

  /** The far end of a mark: its own value, or the top of the stack it is part of. */
  const topAt = (index: number, position: number) =>
    at(grouped ? chart.series[index]!.points[position]!.value : spans[index]![position]!.to);

  const pathOf = (index: number) =>
    chart.categories
      .map((_, position) => round(centre(position)) + ',' + round(topAt(index, position)))
      .join(' ');

  /** An area is its line closed — against the axis, or against the stack beneath it. */
  const areaOf = (index: number) => {
    const top = pathOf(index);
    if (grouped) {
      return (
        round(centre(0)) +
        ',' +
        round(base) +
        ' ' +
        top +
        ' ' +
        round(centre(count - 1)) +
        ',' +
        round(base)
      );
    }

    const under = chart.categories
      .map((_, position) => position)
      .reverse()
      .map((position) => round(centre(position)) + ',' + round(at(spans[index]![position]!.from)))
      .join(' ');

    return top + ' ' + under;
  };

  /** Where a bar's number goes: past the end of a clustered one, inside a stacked one. */
  const valueSpot = (index: number, position: number, slot: number) => {
    const from = at(spans[index]![position]!.from);
    const to = at(spans[index]![position]!.to);
    const across = slot + thickness / 2;

    if (grouped) {
      return sideways
        ? { x: round(Math.max(from, to) + 3), y: round(across + 3), anchor: 'start' as const }
        : { x: round(across), y: round(Math.min(from, to) - 4), anchor: 'middle' as const };
    }

    return sideways
      ? { x: round((from + to) / 2), y: round(across + 3), anchor: 'middle' as const }
      : { x: round(across), y: round((from + to) / 2 + 3), anchor: 'middle' as const };
  };

  /** What a mark's number says — a share, where the axis measures shares. */
  const shown = (point: ChartPoint) => {
    const own = spans[point.seriesIndex]![point.index]!;
    return format(full ? own.to - own.from : point.value);
  };

  return (
    <div className={classes} {...rest}>
      <svg
        className="ub-chart-plot"
        viewBox={'0 0 ' + VIEW_W + ' ' + VIEW_H}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        // Said once on the plot rather than on every mark inside it: the stylesheet is
        // what decides that a segment touching another one needs an edge and a fill that
        // is not see-through, and it can descend to find them.
        data-stacked={grouped ? undefined : ''}
      >
        {showGrid
          ? // Five steps for a share, so the axis reads 0/20/40/60/80/100 rather than by
            // halves, which is the one place a round step is not the readable one.
            ticksBetween(span.low, span.high, full ? 5 : 4).map((tick) => (
              <g key={tick}>
                <line
                  className="ub-chart-grid"
                  x1={sideways ? round(at(tick)) : plotX}
                  x2={sideways ? round(at(tick)) : VIEW_W - padRight}
                  y1={sideways ? plotY : round(at(tick))}
                  y2={sideways ? VIEW_H - padBottom : round(at(tick))}
                  data-zero={tick === 0 ? '' : undefined}
                />
                <text
                  className="ub-chart-label"
                  x={sideways ? round(at(tick)) : plotX - 6}
                  y={sideways ? VIEW_H - 7 : round(at(tick)) + 3}
                  textAnchor={sideways ? 'middle' : 'end'}
                >
                  {format(tick)}
                </text>
              </g>
            ))
          : null}

        {keys.map((key) => (
          <g
            key={key.index}
            transform={'translate(' + round(key.x) + ' ' + round(6 + key.row * LEGEND_STEP) + ')'}
          >
            <rect className="ub-chart-key" width={8} height={8} rx={2} {...paint(key.index)} />
            <text className="ub-chart-label" x={12} y={7}>
              {key.name}
            </text>
          </g>
        ))}

        {shape === 'area' || shape === 'stackedArea'
          ? lineSeries.map((one) => (
              <polygon
                key={one.index}
                className="ub-chart-area"
                {...paint(one.index)}
                points={areaOf(one.index)}
              />
            ))
          : null}

        {barSeries.map((one, slot) => (
          <g key={one.index}>
            {one.points.map((point) => {
              const from = at(spans[one.index]![point.index]!.from);
              const to = at(spans[one.index]![point.index]!.to);
              const near = Math.min(from, to);
              const size = Math.max(1, Math.abs(to - from));
              const across = laneAt(point.index, slot);

              return hit(
                'bar-' + one.index + '-' + point.index,
                point,
                <rect
                  key={point.index}
                  className="ub-chart-bar"
                  x={round(sideways ? near : across)}
                  y={round(sideways ? across : near)}
                  width={round(sideways ? size : thickness)}
                  height={round(sideways ? thickness : size)}
                  // Square in a stack: a rounded corner on a segment with another one
                  // sitting on it is a notch, and four of them are a bar that looks
                  // broken rather than divided.
                  rx={grouped ? 2 : 0}
                  {...paint(one.index)}
                  data-dim={dimmed(point)}
                >
                  <title>{describe(point)}</title>
                </rect>,
              );
            })}
          </g>
        ))}

        {/*
          After the bars, which is the whole of what a combo chart is for: a line drawn
          under its own bars is a line the reader sees in the gaps between them.
        */}
        {lineSeries.map((one) => (
          <polyline
            key={one.index}
            className="ub-chart-line"
            {...paint(one.index)}
            points={pathOf(one.index)}
          />
        ))}

        {lineSeries.map((one) => (
          <g key={one.index}>
            {one.points.map((point) =>
              hit(
                'dot-' + one.index + '-' + point.index,
                point,
                <circle
                  key={point.index}
                  className="ub-chart-dot"
                  cx={round(centre(point.index))}
                  cy={round(topAt(one.index, point.index))}
                  r={3}
                  {...paint(one.index)}
                  data-dim={dimmed(point)}
                >
                  <title>{describe(point)}</title>
                </circle>,
              ),
            )}
          </g>
        ))}

        {showValues
          ? barSeries.map((one, slot) => (
              <g key={one.index}>
                {one.points.map((point) => {
                  const spot = valueSpot(one.index, point.index, laneAt(point.index, slot));
                  return (
                    <text
                      key={point.index}
                      className="ub-chart-value"
                      x={spot.x}
                      y={spot.y}
                      textAnchor={spot.anchor}
                      data-dim={dimmed(point)}
                    >
                      {shown(point)}
                    </text>
                  );
                })}
              </g>
            ))
          : null}

        {showValues
          ? lineSeries.map((one) => (
              <g key={one.index}>
                {one.points.map((point) => (
                  <text
                    key={point.index}
                    className="ub-chart-value"
                    x={round(centre(point.index))}
                    y={round(topAt(one.index, point.index)) - 6}
                    textAnchor="middle"
                    data-dim={dimmed(point)}
                  >
                    {shown(point)}
                  </text>
                ))}
              </g>
            ))
          : null}

        {chart.categories.map((label, position) =>
          position % every === 0 ? (
            <text
              key={position}
              className="ub-chart-label"
              x={sideways ? plotX - 6 : round(centre(position))}
              y={sideways ? round(centre(position)) + 3 : VIEW_H - 8}
              textAnchor={sideways ? 'end' : 'middle'}
              data-dim={dim(label)}
            >
              {label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
`,
};
