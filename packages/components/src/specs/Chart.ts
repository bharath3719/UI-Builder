import { CHART_PALETTE } from '../css.js';
import { CHART } from '../runtime.js';
import type { ComponentSpec } from '../spec.js';

/**
 * The shapes one chart can take. Kept beside the spec because the emitter needs it too.
 *
 * Orientation is not in here, and deliberately: horizontal bars are the same chart lying
 * down, so they are a property of the drawing rather than a different drawing, and folding
 * them in would double every bar entry in a list a person has to read.
 */
export const CHART_KINDS = [
  'bar',
  'stacked',
  'stacked100',
  'line',
  'area',
  'stackedArea',
  'combo',
  'pie',
  'donut',
] as const;

export const ChartSpec: ComponentSpec = {
  key: 'Chart',
  displayName: 'Chart',
  category: 'Data',
  icon: 'ChartColumn',
  keywords: [
    'chart',
    'graph',
    // Not "column": it is what Power BI calls an upright bar, and it is also the first
    // three letters of the word someone types to find a Vertical Stack. The commoner
    // search wins, and "bar" and "chart" already reach this.
    'bar',
    'line',
    'area',
    'pie',
    'donut',
    'stacked',
    'clustered',
    'combo',
    'plot',
    'visual',
    'metric',
  ],
  description: 'Bars, lines, areas or slices — one series or several, and clickable.',

  props: [
    {
      name: 'kind',
      label: 'Shape',
      type: 'enum',
      options: [
        { label: 'Bars', value: 'bar' },
        { label: 'Stacked bars', value: 'stacked' },
        { label: '100% stacked bars', value: 'stacked100' },
        { label: 'Line', value: 'line' },
        { label: 'Area', value: 'area' },
        { label: 'Stacked area', value: 'stackedArea' },
        { label: 'Bars and line', value: 'combo' },
        { label: 'Pie', value: 'pie' },
        { label: 'Donut', value: 'donut' },
      ],
    },
    /*
     * The series, authored the way `Table`'s rows and `Select`'s options are (§7): a set
     * of numbers is data, and building it out of nodes would put the shape of the series
     * nowhere. Bound to a query, it is the array the query answered with.
     *
     * A first line naming the series makes a typed-out block several of them, which is how
     * a stacked or clustered chart can be laid out before there is a query behind it.
     */
    {
      name: 'data',
      label: 'Series',
      type: 'data',
      placeholder: 'North | 1200',
    },
    /*
     * Which key of each row is the category and which is the number. Only meaningful once
     * `data` is bound — a series typed out says which is which by position.
     *
     * Both may be left empty, and usually are: the component reads every numeric key as a
     * series and the first key that is not one as the label, which is the shape a grouped
     * query answers with. That default is what makes binding a Power BI result straight to
     * a chart draw all of it without a field being named.
     */
    { name: 'labelField', label: 'Category field', type: 'string', placeholder: 'Region' },
    { name: 'valueField', label: 'Value fields', type: 'string', placeholder: 'Actual, Target' },
    /*
     * Power BI's legend well, and the other shape a result arrives in. `Values` names one
     * column per series; this names one column whose *contents* are the series, for a
     * query grouped by two things — Region by Month — which is the answer `SUMMARIZECOLUMNS`
     * gives when it is handed two columns and a measure.
     */
    { name: 'seriesField', label: 'Series field', type: 'string', placeholder: 'Region' },
    { name: 'horizontal', label: 'Horizontal bars', type: 'boolean' },
    /*
     * The series colours, in the order the series are drawn.
     *
     * A prop rather than a Design tab declaration, which is where every other colour in
     * this library is set, and the difference is what is being coloured: a Design tab
     * field writes one declaration onto one node, and a palette is a *list* whose length
     * is the chart's own. A rule could set six custom properties; it could not say "these
     * two, and the rest as the theme had them", which is what naming one colour means.
     *
     * Held as one comma-separated string so that a document, a binding and the emitted
     * attribute all stay the string-valued prop they already were — the control is what
     * makes it a row of swatches.
     *
     * `swatches` is the stylesheet's own six, handed over so the inspector can show what
     * an unset palette is already drawing and seed a named one from it. Naming a colour
     * is nearly always adjusting one of these rather than inventing six, and a row of
     * empty wells would make the commonest edit start by matching a colour by eye.
     */
    {
      name: 'palette',
      label: 'Colours',
      type: 'palette',
      placeholder: 'Theme palette',
      swatches: CHART_PALETTE,
    },
    /*
     * The category currently filtered on — bound to the state variable the chart's own
     * `onSelect` writes. Dimming is not decoration: a click that filters the page and
     * leaves the chart looking exactly as it did is a click the reader cannot tell landed,
     * and cannot tell how to undo.
     */
    {
      name: 'selected',
      label: 'Selected category',
      type: 'string',
      placeholder: '{{ state.region }}',
    },
    { name: 'showValues', label: 'Show values', type: 'boolean' },
    { name: 'showGrid', label: 'Show grid', type: 'boolean' },
    { name: 'showLegend', label: 'Show legend', type: 'boolean' },
    { name: 'emptyText', label: 'Empty message', type: 'string', placeholder: 'No data.' },
  ],

  /*
   * Not `onClick`: the handler is called with the mark that was picked, and naming it for
   * the gesture would promise a MouseEvent. `eventPayloads` is what tells the generator
   * the same thing in the one place it has to be true — the exported handler's parameter.
   */
  events: ['onSelect'],
  eventPayloads: {
    onSelect:
      '{ label: string; value: number; index: number; series: string; seriesIndex: number; row: Record<string, unknown> | null }',
  },

  acceptsChildren: false,
  isVoid: true,

  /*
   * A chart's text is drawn inside the plot's `viewBox`, and a length in there is in user
   * units: the whole drawing is 320x180 and scaled to whatever box the chart is given, so
   * `font-size: 16` on the node would mean sixteen one-hundred-and-eightieths of the
   * chart's height, not sixteen pixels. The Design tab's number would be honoured and
   * would not mean what it says, which is worse than not offering it.
   *
   * `lineHeight` and `textAlign` are here for the simpler reason that SVG text has
   * neither — a label is one line, and it is placed by `text-anchor`.
   *
   * Not listed, and deliberately: `color` and `fontFamily`. Both reach SVG text by
   * inheritance, nothing in the drawing out-declares them, and since `--ub-chart-ink`
   * stopped naming `--muted-foreground` outright they do what the fields say.
   */
  unsupportedStyles: ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign'],

  defaultProps: {
    kind: 'bar',
    data: 'North | 1200\nSouth | 980\nEast | 1440\nWest | 760',
    labelField: '',
    valueField: '',
    seriesField: '',
    horizontal: false,
    palette: '',
    selected: '',
    showValues: false,
    // The grid is on for a new chart and off in the component's own parameter default,
    // which look contradictory and are not: an attribute React would be handed as `false`
    // is one the generator omits, so "absent" has to mean the same thing on both sides.
    showGrid: true,
    showLegend: false,
    emptyText: 'No data.',
  },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      from: CHART,
      /*
       * No `class` here, unlike every other template in the library — the component adds
       * `ub-chart` itself, in both renderings, because in both renderings it is the same
       * component. Naming it here as well would put the class on twice in the export and
       * once on the canvas.
       */
      attrs: {
        kind: { prop: 'kind', as: 'enum', options: CHART_KINDS, fallback: 'bar' },
        data: { prop: 'data', as: 'data' },
        /*
         * Written only when they say something. Every other template in the library gets
         * away without this because its empty props are DOM attributes, where `alt=""` is
         * meaningful markup; these are *component* props whose absence and whose empty
         * string mean the same thing, so emitting both is four dead attributes on every
         * chart in an exported page.
         *
         * `selected` is left plain despite meaning the same, because it is the one of the
         * five that is normally *bound*: a condition the generator cannot decide is one it
         * writes out, and `x !== '' ? x : undefined` around every chart's filter is worse
         * than the `selected=""` it saves on the charts nobody wired up.
         */
        labelField: {
          when: { prop: 'labelField', when: 'set' },
          value: { prop: 'labelField', as: 'string' },
        },
        valueField: {
          when: { prop: 'valueField', when: 'set' },
          value: { prop: 'valueField', as: 'string' },
        },
        seriesField: {
          when: { prop: 'seriesField', when: 'set' },
          value: { prop: 'seriesField', as: 'string' },
        },
        horizontal: { prop: 'horizontal', as: 'boolean' },
        palette: {
          when: { prop: 'palette', when: 'set' },
          value: { prop: 'palette', as: 'string' },
        },
        selected: { prop: 'selected', as: 'string' },
        showValues: { prop: 'showValues', as: 'boolean' },
        showGrid: { prop: 'showGrid', as: 'boolean' },
        showLegend: { prop: 'showLegend', as: 'boolean' },
        emptyText: {
          when: { prop: 'emptyText', when: 'set' },
          value: { prop: 'emptyText', as: 'string' },
        },
      },
    },
  },
};
