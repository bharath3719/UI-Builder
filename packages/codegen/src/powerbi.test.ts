/**
 * A Power BI query, exported.
 *
 * Two things are being pinned here and they are different in kind. The first is that the
 * generated page sends the request the canvas sends — same URL, same DAX, same envelope —
 * which is D6 for a query rather than for a style. The second is that the *response*
 * reaches the page the same way: the row adapter is shipped into the export as a copy of
 * the one `schema` uses, and two copies that agree today are two copies that can stop.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  makeNode,
  makePage,
  POWERBI_SCOPE,
  type Page,
  type QueryDef,
} from '@ui-builder/schema';
// The schema copy itself, as text. A `?raw` import rather than `readFileSync` because
// this package's tsconfig has no Node types in it on purpose — "codegen depends on
// nothing" is stated in the tsconfig, and widening it so one test can read a file would
// trade a real constraint for a convenience.
import powerbiTwin from '../../schema/src/powerbi.ts?raw';
import { POWERBI_ADAPTER, type ExportIntegrations } from './integrations.js';
import { POWERBI_MODULE } from './lib.js';
import { generatePage } from './page.js';

/* -------------------------------------------------------------------------- */
/* The shipped copy of the row adapter                                         */
/* -------------------------------------------------------------------------- */

/** Everything after the file-level comment — the part the two copies share. */
function body(source: string): string {
  const start = source.indexOf('\n/** One row of a result');
  expect(start, 'no anchor to compare from').toBeGreaterThan(-1);
  // Line endings are the working copy's business, not the comparison's.
  return source.slice(start + 1).replace(/\r\n/g, '\n');
}

describe('the exported row adapter', () => {
  it('is its schema twin, from the first export down', () => {
    expect(body(POWERBI_MODULE.source)).toBe(body(powerbiTwin));
  });

  it('survives the literal it is stored in', () => {
    // The source lives in a template literal in `lib.ts`. A backtick would end it and a
    // dollar-brace would start an interpolation, and both are syntax errors reported a
    // long way from the character that caused them.
    expect(POWERBI_MODULE.source).not.toContain('`');
    expect(POWERBI_MODULE.source).not.toContain('${');
  });

  it('lands where its import specifier points', () => {
    // A page is `src/pages/<Name>.tsx`, so its specifier resolves against `src/pages/`.
    const resolved = new URL(POWERBI_MODULE.specifier, 'file:///src/pages/').pathname.slice(1);
    expect(`${resolved}.ts`).toBe(POWERBI_MODULE.path);
  });
});

/* -------------------------------------------------------------------------- */
/* The generated request                                                       */
/* -------------------------------------------------------------------------- */

function integrations(): ExportIntegrations {
  return {
    pbi: {
      slug: 'contoso-bi',
      name: 'Contoso BI',
      connection: {
        baseUrl: 'https://api.powerbi.com',
        auth: {
          type: 'oauth2',
          tokenUrl: 'https://login.microsoftonline.com/t/oauth2/v2.0/token',
          clientId: 'app',
          scope: POWERBI_SCOPE,
        },
        defaultHeaders: {},
        contentType: 'application/json',
      },
      endpoints: {},
    },
  };
}

function pageWith(query: QueryDef): Page {
  const root = makeNode({ id: 'root', type: 'Box', name: 'Page' });
  const text = makeNode({
    id: 't1',
    type: 'Text',
    name: 'Rows',
    parentId: 'root',
    props: { text: { kind: 'expr', code: '{{ queries.sales.data }}' } },
  });

  return makePage({
    id: 'p1',
    name: 'Home',
    path: '/',
    rootId: 'root',
    nodes: { root: { ...root, children: ['t1'] }, t1: text },
    queries: [query],
  });
}

function daxQuery(over: Partial<Extract<QueryDef['source'], { kind: 'powerbi' }>> = {}): QueryDef {
  return {
    id: 'q1',
    name: 'sales',
    runOnLoad: true,
    source: {
      kind: 'powerbi',
      integrationId: 'pbi',
      datasetId: 'ds-1',
      groupId: 'grp-1',
      dax: 'EVALUATE Sales',
      ...over,
    },
  };
}

describe('a Power BI query in the export', () => {
  it('writes the executeQueries URL as a literal when nothing in it is bound', () => {
    const { tsx } = generatePage(pageWith(daxQuery()), DEFAULT_THEME, {
      integrations: integrations(),
    });

    expect(tsx).toContain(
      "url: 'https://api.powerbi.com/v1.0/myorg/groups/grp-1/datasets/ds-1/executeQueries',",
    );
    expect(tsx).toContain("method: 'POST',");
  });

  it('drops the workspace segment when there is no workspace', () => {
    const { tsx } = generatePage(pageWith(daxQuery({ groupId: undefined })), DEFAULT_THEME, {
      integrations: integrations(),
    });

    expect(tsx).toContain(
      "url: 'https://api.powerbi.com/v1.0/myorg/datasets/ds-1/executeQueries',",
    );
  });

  it('writes the DAX inside the envelope the API takes', () => {
    const { tsx } = generatePage(pageWith(daxQuery()), DEFAULT_THEME, {
      integrations: integrations(),
    });

    expect(tsx).toContain(
      'body: \'{"queries":[{"query":"EVALUATE Sales"}],"serializerSettings":{"includeNulls":true}}\',',
    );
  });

  /**
   * A bound id becomes code rather than a literal, and is encoded the way the runtime
   * encodes it — the two must not disagree about a dataset id with something awkward in it.
   */
  it('encodes a bound dataset id the way the canvas does', () => {
    const { tsx } = generatePage(
      pageWith(daxQuery({ datasetId: '{{ state.dataset }}' })),
      DEFAULT_THEME,
      { integrations: integrations() },
    );

    expect(tsx).toContain('encodeURIComponent(');
    expect(tsx).toContain('state.dataset');
  });

  it('builds the body with JSON.stringify when the DAX reads state', () => {
    const { tsx } = generatePage(
      pageWith(daxQuery({ dax: 'EVALUATE TOPN({{ state.limit }}, Sales)' })),
      DEFAULT_THEME,
      { integrations: integrations() },
    );

    expect(tsx).toContain('body: JSON.stringify({ queries: [{ query:');
    expect(tsx).toContain('serializerSettings: { includeNulls: true }');
  });

  it('imports the adapter and hands it to the query', () => {
    const output = generatePage(pageWith(daxQuery()), DEFAULT_THEME, {
      integrations: integrations(),
    });

    expect(output.tsx).toContain(`import { ${POWERBI_ADAPTER} } from '../lib/powerbi';`);
    expect(output.tsx).toContain(`adapt: ${POWERBI_ADAPTER},`);
    expect(output.runtime).toContainEqual(POWERBI_MODULE);
  });

  /** An OAuth2 connection exports as a bearer read from the environment — see `authCode`. */
  it('reads the token from the environment rather than minting one', () => {
    const output = generatePage(pageWith(daxQuery()), DEFAULT_THEME, {
      integrations: integrations(),
    });

    expect(output.tsx).toContain('Authorization: `Bearer ${CONTOSO_BI_TOKEN}`');
    expect(output.envVars).toEqual(['VITE_CONTOSO_BI_TOKEN']);
    // The client secret is not in the export, because it was never in the document.
    expect(output.tsx).not.toContain('client_secret');
    expect(output.tsx).not.toContain(POWERBI_SCOPE);
  });

  it('ships neither the adapter nor its import when no query needs one', () => {
    const url: QueryDef = {
      id: 'q1',
      name: 'sales',
      runOnLoad: true,
      source: { kind: 'url', method: 'GET', url: '/api/sales' },
    };

    const output = generatePage(pageWith(url), DEFAULT_THEME, { integrations: integrations() });

    expect(output.tsx).not.toContain('powerbi');
    expect(output.runtime).not.toContainEqual(POWERBI_MODULE);
  });

  it('warns and leaves the query out when its connection has gone', () => {
    const output = generatePage(pageWith(daxQuery()), DEFAULT_THEME, { integrations: {} });

    expect(output.warnings.join(' ')).toContain('no longer in this workspace');
    expect(output.tsx).not.toContain('executeQueries');
  });
});
