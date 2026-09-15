/**
 * The chart, which is the one component in this library whose *markup* is a function of
 * its data — so the things worth pinning are the ones a render cannot be eyeballed for.
 *
 * The twin test in `runtime.test.ts` says the exported copy is this code; these say what
 * the code does. Together they are what stands in for the shared emit template every
 * other component has (D6).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Chart, buildChart } from './Chart.js';

/** One category per row, one number in it — what a grouped query answers with. */
const ROWS = [
  { Region: 'North', Total: 1200 },
  { Region: 'South', Total: 980 },
];

/** One column per series, which is Power BI's Values well with two fields in it. */
const WIDE = [
  { Month: 'Jan', North: 10, South: 4 },
  { Month: 'Feb', North: 12, South: 6 },
];

/** One row per category *and* series, which is its Legend well. South never saw Feb. */
const LONG = [
  { Month: 'Jan', Region: 'North', Sales: 10 },
  { Month: 'Jan', Region: 'South', Sales: 4 },
  { Month: 'Feb', Region: 'North', Sales: 12 },
];

// `createElement` rather than JSX, so this is a `.ts` file like every other test here.
function html(props: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(Chart, props));
}

/** How many marks of a class the render drew. */
function count(markup: string, className: string): number {
  return markup.split(`class="${className}"`).length - 1;
}

/** One numeric attribute off every bar, in the order they were drawn. */
function bars(markup: string, attribute: string): number[] {
  const pattern = new RegExp(`class="ub-chart-bar"[^>]*?\\s${attribute}="([-\\d.]+)"`, 'g');
  return [...markup.matchAll(pattern)].map((match) => Number(match[1]));
}

/** The names a series list carries, which is what a legend and a payload are made of. */
function names(data: unknown, label = '', value = '', series = ''): string[] {
  return buildChart(data, label, value, series).series.map((one) => one.name);
}

describe('the series', () => {
  it('reads a grouped result with nothing configured', () => {
    // The shape a `SUMMARIZECOLUMNS` answers with, and the reason a chart bound straight
    // to a Power BI query draws something before any field has been named: the numeric
    // keys are the series, the first key that is not one is the category.
    const chart = buildChart(ROWS, '', '', '');

    expect(chart.categories).toEqual(['North', 'South']);
    expect(chart.series).toEqual([
      {
        name: 'Total',
        index: 0,
        points: [
          { label: 'North', value: 1200, index: 0, series: 'Total', seriesIndex: 0, row: ROWS[0] },
          { label: 'South', value: 980, index: 1, series: 'Total', seriesIndex: 0, row: ROWS[1] },
        ],
      },
    ]);
  });

  it('reads every numeric column as a series of its own', () => {
    // A result with two measures in it is two series, not the first of two — which is
    // what makes a clustered or stacked chart bindable without naming anything either.
    expect(names(WIDE)).toEqual(['North', 'South']);
    expect(buildChart(WIDE, '', '', '').categories).toEqual(['Jan', 'Feb']);
  });

  it('reads the first column as the axis when every column is a number', () => {
    // A year or an hour is a category that happens to be numeric, and there is no
    // non-numeric key left to find it by.
    const chart = buildChart([{ Year: 2024, Sales: 10 }], '', '', '');

    expect(chart.categories).toEqual(['2024']);
    expect(chart.series.map((one) => one.name)).toEqual(['Sales']);
  });

  it('prefers the fields that were named', () => {
    const rows = [{ a: 'x', b: 1, c: 9 }];

    expect(buildChart(rows, 'a', 'c', '').series[0]?.points[0]).toMatchObject({
      label: 'x',
      value: 9,
    });
  });

  it('takes several value fields, in the order they were named', () => {
    expect(names(WIDE, 'Month', 'South, North')).toEqual(['South', 'North']);
  });

  it('pivots a series field into one series per distinct value', () => {
    const chart = buildChart(LONG, '', '', 'Region');

    expect(chart.categories).toEqual(['Jan', 'Feb']);
    expect(chart.series.map((one) => one.name)).toEqual(['North', 'South']);
    expect(chart.series[0]?.points.map((point) => point.value)).toEqual([10, 12]);
  });

  it('gives every series every category, so stacks and clusters line up', () => {
    // South has no February row. Without a point standing in for it, the segment above it
    // would be found by index and would be somebody else's.
    const south = buildChart(LONG, '', '', 'Region').series[1];

    expect(south?.points.map((point) => point.label)).toEqual(['Jan', 'Feb']);
    expect(south?.points[1]).toMatchObject({ value: 0, row: null });
  });

  it('adds up rows that land in the same slot', () => {
    // Pivoting a series field *is* grouping by category, so two rows in one slot have to
    // become one segment — and a result that was not fully grouped means its total.
    const chart = buildChart(
      [
        { r: 'N', t: 1 },
        { r: 'N', t: 2 },
      ],
      '',
      '',
      '',
    );

    expect(chart.categories).toEqual(['N']);
    expect(chart.series[0]?.points[0]?.value).toBe(3);
  });

  it('parses a typed-out series, splitting on the last separator', () => {
    // A category with a pipe in it is likelier than a number with one.
    const chart = buildChart('A | B | 12', '', '', '');

    expect(chart.series).toHaveLength(1);
    expect(chart.series[0]?.points[0]).toMatchObject({ label: 'A | B', value: 12 });
  });

  it('reads a first line of names as a heading, and then every separator', () => {
    // Which is how a stacked or clustered chart can be laid out before there is a query
    // behind it. A first line whose cells are numbers is data, not a heading.
    const chart = buildChart('Month | North | South\nJan | 10 | 4\nFeb | 12 | 6', '', '', '');

    expect(chart.categories).toEqual(['Jan', 'Feb']);
    expect(chart.series.map((one) => one.name)).toEqual(['North', 'South']);
    expect(chart.series[1]?.points.map((point) => point.value)).toEqual([4, 6]);
  });

  it('reads a number that arrived as text, separators and all', () => {
    // An API answering with "1,200" is not an error to report; it is a number to draw.
    expect(buildChart([{ r: 'N', t: '1,200' }], 'r', 't', '').series[0]?.points[0]?.value).toBe(
      1200,
    );
  });

  it('carries the whole row, so a handler can act on more than the label', () => {
    expect(buildChart(ROWS, '', '', '').series[0]?.points[0]?.row).toBe(ROWS[0]);
    // Nothing to carry when the series was typed rather than bound, and null says that
    // rather than an empty object, which would read as a row with no fields.
    expect(buildChart('A | 1', '', '', '').series[0]?.points[0]?.row).toBeNull();
  });

  it('is empty for anything that is neither an array nor text', () => {
    for (const value of [undefined, null, 42]) {
      expect(buildChart(value, '', '', '')).toEqual({ categories: [], series: [] });
    }
  });
});

describe('what it draws', () => {
  it('draws one mark per row', () => {
    expect(count(html({ kind: 'bar', data: ROWS }), 'ub-chart-bar')).toBe(2);
    expect(count(html({ kind: 'donut', data: ROWS }), 'ub-chart-slice')).toBe(2);
    expect(count(html({ kind: 'line', data: ROWS }), 'ub-chart-dot')).toBe(2);
  });

  it('stands the series of a clustered chart side by side', () => {
    // Two series over two categories is four bars, each narrower than the band, and the
    // colour is the series rather than the category — which the axis already names.
    const markup = html({ kind: 'bar', data: WIDE });

    expect(count(markup, 'ub-chart-bar')).toBe(4);
    expect(markup).toContain('data-series="1"');
    // One width for every bar in the chart: a cluster shares its band out evenly.
    expect(new Set(bars(markup, 'width')).size).toBe(1);
  });

  it('stacks a segment on top of the one below it', () => {
    // One category, so the stack is the whole axis: the two heights have to be the plot,
    // which is what says the segments were placed end to end rather than both from zero.
    const heights = bars(html({ kind: 'stacked', data: [{ m: 'Jan', a: 10, b: 30 }] }), 'height');

    expect(heights).toHaveLength(2);
    expect(heights[0]! + heights[1]!).toBeCloseTo(146, 1);
    // Three times the value is three times the segment.
    expect(heights[1]! / heights[0]!).toBeCloseTo(3, 1);
  });

  it('measures a 100% stacked chart in shares, whatever the numbers were', () => {
    const markup = html({ kind: 'stacked100', data: WIDE, showGrid: true, showValues: true });

    expect(markup).toContain('100%');
    expect(markup).toContain('0%');
    // Jan is 10 and 4, which is 71% and 29% — the axis stopped being about tens.
    expect(markup).toContain('71%');
    expect(markup).not.toContain('>10<');
  });

  it('lies the bar family down when it is asked to, and nothing else', () => {
    // Sideways, the band is the height and the value is the width, so the constant one
    // swaps over. A line has an order along its axis and is left standing.
    const sideways = html({ kind: 'bar', data: ROWS, horizontal: true });

    expect(new Set(bars(sideways, 'height')).size).toBe(1);
    expect(new Set(bars(sideways, 'width')).size).toBe(2);

    const upright = html({ kind: 'bar', data: ROWS });
    expect(new Set(bars(upright, 'width')).size).toBe(1);

    expect(html({ kind: 'line', data: ROWS, horizontal: true })).toBe(
      html({ kind: 'line', data: ROWS }),
    );
  });

  it('draws a combo as bars for the first series and a line for the rest', () => {
    const markup = html({ kind: 'combo', data: WIDE });

    expect(count(markup, 'ub-chart-bar')).toBe(2);
    expect(count(markup, 'ub-chart-line')).toBe(1);
    // Against the same axis as the bars, so the two are comparable rather than adjacent.
    expect(count(markup, 'ub-chart-dot')).toBe(2);
  });

  it('names the series in a legend once there is more than one', () => {
    const markup = html({ kind: 'bar', data: WIDE, showLegend: true });

    expect(count(markup, 'ub-chart-key')).toBe(2);
    expect(markup).toContain('North');
    expect(markup).toContain('South');
  });

  it('draws a single category as a ring rather than as nothing', () => {
    // An arc from a point back to itself draws nothing at all, which is the classic way a
    // pie chart of one value renders blank.
    const markup = html({ kind: 'pie', data: [{ r: 'Only', t: 5 }] });

    expect(markup).toContain('ub-chart-slice');
    expect(markup).toMatch(/d="M [^"]*A [^"]*A [^"]*Z"/);
  });

  it('draws a pie of the first series, because a whole is one series', () => {
    expect(count(html({ kind: 'pie', data: WIDE }), 'ub-chart-slice')).toBe(2);
  });

  it('keeps zero on the axis, so no difference is exaggerated', () => {
    // The one charting decision that can make a page lie.
    const markup = html({
      kind: 'bar',
      data: [
        { r: 'A', t: 100 },
        { r: 'B', t: 101 },
      ],
      showGrid: true,
    });

    expect(markup).toContain('data-zero');
  });

  it('says so rather than drawing an empty frame', () => {
    expect(html({ data: [], emptyText: 'No data.' })).toContain('No data.');
    expect(html({ data: [], emptyText: '' })).not.toContain('ub-chart-plot');
  });

  it('formats an axis the same way wherever it is read', () => {
    // Hand-rolled rather than Intl, whose output is the reader's locale's business — and
    // an export that disagreed with the canvas about an axis label would be D6 broken.
    expect(html({ kind: 'bar', data: [{ r: 'A', t: 1200 }], showValues: true })).toContain('1.2k');
  });
});

/**
 * Nine shapes times two orientations is eighteen drawings, and a chart is the one
 * component here whose coordinates are arithmetic on the author's numbers — so the way it
 * fails is a mark at NaN, or one drawn a long way outside the frame, neither of which
 * throws and neither of which any assertion about *what* it drew would notice.
 *
 * The data is chosen to be the awkward case on purpose: a negative to stack downward, a
 * category that is nothing at all to divide by, and a share taken of zero.
 */
describe('every drawing stays inside its frame', () => {
  const AWKWARD = [
    { Month: 'Jan', North: 10, South: -4 },
    { Month: 'Feb', North: 12, South: 6 },
    { Month: 'Mar', North: 0, South: 0 },
  ];

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

  /** Every number in every geometry attribute, the points lists unpacked into it. */
  function coordinates(markup: string): number[] {
    const attributes = [...markup.matchAll(/(?:x|y|cx|cy|width|height|r)="([-\d.]+)"/g)].map(
      (match) => Number(match[1]),
    );
    const paths = [...markup.matchAll(/points="([^"]+)"/g)].flatMap((match) =>
      match[1]!.split(' ').flatMap((pair) => pair.split(',').map(Number)),
    );
    return [...attributes, ...paths];
  }

  for (const kind of KINDS) {
    for (const horizontal of [false, true]) {
      it(kind + (horizontal ? ', lying down' : ''), () => {
        const markup = html({
          kind,
          data: AWKWARD,
          horizontal,
          showGrid: true,
          showValues: true,
          showLegend: true,
          onSelect: () => {},
        });

        expect(markup).not.toContain('NaN');

        const numbers = coordinates(markup);
        expect(numbers.length).toBeGreaterThan(0);
        for (const value of numbers) {
          expect(Number.isFinite(value)).toBe(true);
          // The viewBox, with a couple of units of slack for a stroke on the edge of it.
          expect(value).toBeGreaterThanOrEqual(-2);
          expect(value).toBeLessThanOrEqual(322);
        }
      });
    }
  }

  it('draws one category of one series without dividing by zero', () => {
    for (const kind of KINDS) {
      expect(html({ kind, data: 'Only | 5', showGrid: true, showValues: true })).not.toContain(
        'NaN',
      );
    }
  });
});

describe('the cross-filter', () => {
  it('dims every mark that is not the one filtered on', () => {
    const markup = html({ kind: 'bar', data: ROWS, selected: 'North' });

    expect(count(markup, 'ub-chart-bar')).toBe(2);
    expect(markup.split('data-dim').length - 1).toBeGreaterThan(0);
    // The selected one is not dimmed, which is the whole point of dimming the rest.
    expect(markup.indexOf('North')).toBeGreaterThan(-1);
  });

  it('dims a category across every series, because that is what was filtered', () => {
    // Four bars, two of them February's — one per series — and both go dim.
    const markup = html({ kind: 'bar', data: WIDE, selected: 'Jan' });

    expect(markup.split('data-dim=""').length - 1).toBe(3);
  });

  it('dims nothing while nothing is filtered on', () => {
    expect(html({ kind: 'bar', data: ROWS, selected: '' })).not.toContain('data-dim');
  });

  it('draws hit targets only once it has somewhere to send a click', () => {
    // Which is also how it renders while it is being designed: the renderer attaches no
    // handlers on the canvas, so the chart there is a picture with no focus stops and no
    // pointer cursor — a promise the page could not keep.
    expect(html({ kind: 'bar', data: ROWS })).not.toContain('ub-chart-hit');

    const wired = html({ kind: 'bar', data: ROWS, onSelect: () => {} });
    expect(count(wired, 'ub-chart-hit')).toBe(2);
    expect(wired).toContain('role="button"');
    expect(wired).toContain('tabindex="0"');
  });

  it('says which series a mark belongs to once there is more than one', () => {
    // The payload carries it, and so does what a screen reader is handed.
    const markup = html({ kind: 'bar', data: WIDE, onSelect: () => {} });

    expect(markup).toContain('aria-label="North · Jan: 10"');
    expect(html({ kind: 'bar', data: ROWS, onSelect: () => {} })).toContain(
      'aria-label="North: 1.2k"',
    );
  });
});
