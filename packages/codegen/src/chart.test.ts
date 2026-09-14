/**
 * What a chart and a cross-filter become in an exported page.
 *
 * Three things here have no precedent elsewhere in the generator, and each is a way the
 * export could differ from the canvas without a snapshot noticing:
 *
 * - a prop handed over with **no coercion** (`as: 'data'`), because the component takes
 *   `unknown` and decides for itself what arrived;
 * - a handler whose `event` is a **value the component passed**, not a DOM event, which
 *   the export's own `tsc` would reject if it were typed from the element;
 * - a write whose second application is a **clear**, which has to compare against what the
 *   store holds rather than what this render closed over — the same rule `toggleState`
 *   follows, and for the same reason.
 *
 * The fourth is the one that cannot be kept and is therefore said out loud instead: a step
 * cannot see a write made beside it, so filtering and then running a query sends the
 * previous filter.
 */

import {
  DEFAULT_THEME,
  exprProp,
  makeNode,
  makePage,
  staticProp,
  type ActionStep,
  type Json,
  type Node,
  type Page,
  type QueryDef,
  type StateVar,
} from '@ui-builder/schema';
import { describe, expect, test } from 'vitest';
import { generatePage } from './page.js';
import { generateProject } from './project.js';
import { powerbiDoc, powerbiIntegrations } from './fixtures.js';

const REGION: StateVar = { id: 'sv-region', name: 'region', type: 'string', initial: '' };

/** A page holding one chart, since that is what every test here is about. */
function chartPage(init: {
  props?: Record<string, Json>;
  bound?: Record<string, string>;
  events?: Record<string, ActionStep[]>;
  state?: StateVar[];
  queries?: QueryDef[];
}): Page {
  const nodes: Record<string, Node> = {
    root: makeNode({ id: 'root', parentId: null, type: 'VStack', name: 'Page', children: ['c'] }),
    c: makeNode({
      id: 'c',
      parentId: 'root',
      type: 'Chart',
      name: 'Sales',
      props: {
        ...Object.fromEntries(
          Object.entries(init.props ?? {}).map(([name, value]) => [name, staticProp(value)]),
        ),
        ...Object.fromEntries(
          Object.entries(init.bound ?? {}).map(([name, code]) => [name, exprProp(code)]),
        ),
      },
      ...(init.events === undefined ? {} : { events: init.events }),
    }),
  };

  return makePage({
    id: 'p',
    name: 'Home',
    path: '/',
    rootId: 'root',
    nodes,
    state: init.state ?? [],
    queries: init.queries ?? [],
  });
}

function tsxOf(init: Parameters<typeof chartPage>[0]): string {
  return generatePage(chartPage(init), DEFAULT_THEME).tsx;
}

/** A Power BI query whose DAX reads a state variable — the thing a filter re-runs. */
function detailQuery(runOnLoad: boolean): QueryDef {
  return {
    id: 'q-detail',
    name: 'detail',
    runOnLoad,
    source: {
      kind: 'powerbi',
      integrationId: 'int-pbi',
      datasetId: 'ds',
      dax: 'EVALUATE FILTER(Sales, Sales[Region] = "{{ state.region }}")',
    },
  };
}

describe('a series handed to a component', () => {
  test('a bound series arrives as it stands, with nothing wrapped round it', () => {
    // Every other coercion narrows a value to something an attribute can hold. This one
    // must not: `text(...)` here would hand the chart the string "[object Object]" per row,
    // and the canvas hands it the array.
    const tsx = tsxOf({ bound: { data: '{{ queries.sales.data }}' } });

    expect(tsx).toContain('data={queries.sales.data}');
    expect(tsx).not.toContain('data={text(');
    expect(tsx).not.toContain('data={list(');
  });

  test('a typed-out series is written as an expression, not between quotes', () => {
    // A JSX attribute string carrying a raw newline is legal and means whatever the
    // transform decides; as an escape in an expression it means one thing everywhere.
    const tsx = tsxOf({ props: { data: 'North | 12\nSouth | 8' } });

    expect(tsx).toContain("data={'North | 12\\nSouth | 8'}");
  });

  test('props that say nothing are left off', () => {
    // They are component props, not DOM attributes: absent and empty mean the same thing
    // to the component, so writing both is noise on every chart in the page.
    const tsx = tsxOf({
      props: { kind: 'bar', labelField: '', valueField: '', seriesField: '', emptyText: '' },
    });

    expect(tsx).not.toContain('labelField');
    expect(tsx).not.toContain('valueField');
    expect(tsx).not.toContain('seriesField');
    expect(tsx).not.toContain('emptyText');
  });

  test('the shape, the series field and the orientation reach the component', () => {
    // The three props that decide which of the nine drawings this is. `horizontal` is
    // written bare because it is true, which is the form the component's own parameter
    // default is arranged around.
    const tsx = tsxOf({
      props: { kind: 'stacked100', seriesField: 'Region', horizontal: true },
    });

    expect(tsx).toContain('kind="stacked100"');
    expect(tsx).toContain('seriesField="Region"');
    expect(tsx).toContain('horizontal');
  });

  test('an upright chart says nothing about being upright', () => {
    expect(tsxOf({ props: { kind: 'bar', horizontal: false } })).not.toContain('horizontal');
  });

  test('a shape the library has since dropped falls back rather than breaking', () => {
    // A document outlives the spec that produced it, and `asEnum` is what decides that —
    // the same rule every other variant prop in the library follows.
    expect(tsxOf({ props: { kind: 'sunburst' } })).toContain('kind="bar"');
  });
});

describe('a handler whose event is a value', () => {
  test('the parameter is typed from the spec, not from the element it landed on', () => {
    // Typed from the element this would be `MouseEvent<HTMLDivElement>`, and `event.label`
    // would fail the export's own `tsc` — which is the only thing that checks it.
    const tsx = tsxOf({
      state: [REGION],
      events: {
        onSelect: [
          { kind: 'setState', stateId: 'sv-region', value: exprProp('{{ event.label }}') },
        ],
      },
    });

    expect(tsx).toContain('(event: { label: string; value: number;');
    expect(tsx).not.toContain('MouseEvent');
    // The structural type needs no import, which is the reason it is written as one.
    expect(tsx).not.toContain("from '../components/Chart'\nimport type");
  });

  test('a handler that never reads the event still takes no parameter', () => {
    const tsx = tsxOf({
      state: [REGION],
      events: {
        onSelect: [{ kind: 'setState', stateId: 'sv-region', value: staticProp('North') }],
      },
    });

    expect(tsx).toContain('onSalesSelect = () =>');
  });
});

describe('setFilter', () => {
  test('writes the value, and clears when the variable already holds it', () => {
    const tsx = tsxOf({
      state: [REGION],
      events: {
        onSelect: [
          { kind: 'setFilter', stateId: 'sv-region', value: exprProp('{{ event.label }}') },
        ],
      },
    });

    // Read from `current`, not from the render's `state`: the value a second click clears
    // has to be the one the store holds. That is `toggleState`'s rule, and the runtime's.
    expect(tsx).toContain('setState((current) => {');
    expect(tsx).toContain('const picked = text(event.label);');
    expect(tsx).toContain("region: text(current.region) === picked ? '' : picked");
  });

  test('a variable that no longer exists drops the step and says so', () => {
    const { tsx, warnings } = generatePage(
      chartPage({
        events: {
          onSelect: [{ kind: 'setFilter', stateId: 'gone', value: staticProp('North') }],
        },
      }),
      DEFAULT_THEME,
    );

    expect(tsx).not.toContain('setState');
    expect(warnings[0]).toContain('filters on a variable that no longer exists');
  });
});

/**
 * Only the staleness warnings.
 *
 * A page generated on its own has no connections behind it, so a Power BI query is
 * dropped with a warning of its own — which is right, and is not what these tests are
 * about.
 */
function staleOnes(warnings: readonly string[]): string[] {
  return warnings.filter((warning) => warning.includes('previous value'));
}

describe('filtering and then fetching', () => {
  test('warns when a step runs a query whose request reads what was just written', () => {
    const { warnings } = generatePage(
      chartPage({
        state: [REGION],
        queries: [detailQuery(false)],
        events: {
          onSelect: [
            { kind: 'setFilter', stateId: 'sv-region', value: exprProp('{{ event.label }}') },
            { kind: 'runQuery', queryId: 'q-detail' },
          ],
        },
      }),
      DEFAULT_THEME,
    );

    expect(warnings.join('\n')).toContain('state.region');
    expect(warnings.join('\n')).toContain('previous value');
  });

  test('a query that reads nothing written is not warned about', () => {
    const plain: QueryDef = {
      id: 'q-all',
      name: 'all',
      runOnLoad: false,
      source: { kind: 'url', method: 'GET', url: 'https://example.test/all' },
    };

    const { warnings } = generatePage(
      chartPage({
        state: [REGION],
        queries: [plain],
        events: {
          onSelect: [
            { kind: 'setFilter', stateId: 'sv-region', value: exprProp('{{ event.label }}') },
            { kind: 'runQuery', queryId: 'q-all' },
          ],
        },
      }),
      DEFAULT_THEME,
    );

    expect(staleOnes(warnings)).toEqual([]);
  });

  test('running a query with no write beside it is the ordinary case', () => {
    const { warnings } = generatePage(
      chartPage({
        state: [REGION],
        queries: [detailQuery(false)],
        events: { onSelect: [{ kind: 'runQuery', queryId: 'q-detail' }] },
      }),
      DEFAULT_THEME,
    );

    expect(staleOnes(warnings)).toEqual([]);
  });
});

describe('the Power BI project', () => {
  test('ships the chart component, once, because a page reached for it', () => {
    const { files } = generateProject(powerbiDoc(), { integrations: powerbiIntegrations() });
    const paths = files.map((file) => file.path);

    expect(paths).toContain('src/components/Chart.tsx');
    expect(paths.filter((path) => path === 'src/components/Chart.tsx')).toHaveLength(1);
  });

  test('exports without a warning', () => {
    // Including the stale-query one: the fixture's cross-filter is a write and nothing
    // else, which is the form this whole feature is arranged to make the obvious one.
    expect(generateProject(powerbiDoc(), { integrations: powerbiIntegrations() }).warnings).toEqual(
      [],
    );
  });

  test('is this page', () => {
    const { files } = generateProject(powerbiDoc(), { integrations: powerbiIntegrations() });
    const page = files.find((file) => file.path === 'src/pages/Home.tsx');

    expect(page?.contents).toMatchSnapshot();
  });
});
