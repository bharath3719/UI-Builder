import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, makeNode, makePage, type Page, type QueryDef } from '@ui-builder/schema';
import { generatePage } from './page.js';
import { tokenConstName, type ExportIntegrations } from './integrations.js';

/**
 * One connection with one endpoint, which is all any of these need. The endpoint's path
 * carries a hole so the two template layers can be seen collapsing into one.
 */
function integrations(over: Partial<ExportIntegrations['x']> = {}): ExportIntegrations {
  return {
    int1: {
      slug: 'acme-crm',
      name: 'Acme CRM',
      connection: {
        baseUrl: 'https://api.acme.io/v1',
        auth: { type: 'bearer' },
        defaultHeaders: { Accept: 'application/json' },
        contentType: 'application/json',
      },
      endpoints: {
        ep1: {
          method: 'GET',
          path: '/users/{{ userId }}',
          headers: {},
          body: null,
          resultPath: 'data.items',
        },
      },
      ...over,
    },
  };
}

function pageWith(query: QueryDef): Page {
  const root = makeNode({ id: 'root', type: 'Box', name: 'Page' });
  const text = makeNode({
    id: 't1',
    type: 'Text',
    name: 'Names',
    parentId: 'root',
    props: { text: { kind: 'expr', code: '{{ queries.users.data }}' } },
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

function boundQuery(variables: Record<string, string> = {}): QueryDef {
  return {
    id: 'q1',
    name: 'users',
    runOnLoad: true,
    source: { kind: 'integration', integrationId: 'int1', endpointId: 'ep1', variables },
  };
}

describe('an integration query in the export', () => {
  it('writes the connection base URL and endpoint path as one URL', () => {
    const { tsx } = generatePage(pageWith(boundQuery()), DEFAULT_THEME, {
      integrations: integrations(),
    });

    expect(tsx).toContain("url: 'https://api.acme.io/v1/users/',");
  });

  /**
   * The two template layers collapsed at generation time. This is the whole reason an
   * export needs no integration machinery: by the time the file is written, the request
   * is an ordinary one whose URL happens to contain the page's own expression.
   */
  it("folds the page's variable into the endpoint's hole", () => {
    const { tsx } = generatePage(
      pageWith(boundQuery({ userId: '{{ state.id }}' })),
      DEFAULT_THEME,
      {
        integrations: integrations(),
      },
    );

    expect(tsx).toContain('url: `https://api.acme.io/v1/users/${text(state.id)}`,');
  });

  it('reads the token from the environment rather than baking it in', () => {
    const { tsx, envVars } = generatePage(pageWith(boundQuery()), DEFAULT_THEME, {
      integrations: integrations(),
    });

    expect(tsx).toContain(
      `const ${tokenConstName('acme-crm')} = import.meta.env.VITE_ACME_CRM_TOKEN ?? '';`,
    );
    expect(tsx).toContain('Authorization: `Bearer ${ACME_CRM_TOKEN}`');
    expect(envVars).toEqual(['VITE_ACME_CRM_TOKEN']);
  });

  it("carries the connection's default headers", () => {
    const { tsx } = generatePage(pageWith(boundQuery()), DEFAULT_THEME, {
      integrations: integrations(),
    });

    expect(tsx).toContain("Accept: 'application/json'");
  });

  it('sends an API key as a named header', () => {
    const withKey = integrations({
      connection: {
        baseUrl: 'https://api.acme.io/v1',
        auth: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        defaultHeaders: {},
        contentType: 'application/json',
      },
    });
    const { tsx } = generatePage(pageWith(boundQuery()), DEFAULT_THEME, { integrations: withKey });

    expect(tsx).toContain("'X-Api-Key': ACME_CRM_TOKEN");
  });

  it('appends an API key that belongs in the query string, encoded', () => {
    const withKey = integrations({
      connection: {
        baseUrl: 'https://api.acme.io/v1',
        auth: { type: 'apiKey', in: 'query', name: 'api_key' },
        defaultHeaders: {},
        contentType: 'application/json',
      },
    });
    const { tsx } = generatePage(pageWith(boundQuery()), DEFAULT_THEME, { integrations: withKey });

    expect(tsx).toContain("+ '?api_key=' + encodeURIComponent(ACME_CRM_TOKEN)");
  });

  it('declares no token at all for a connection that needs none', () => {
    const open = integrations({
      connection: {
        baseUrl: 'https://api.acme.io/v1',
        auth: { type: 'none' },
        defaultHeaders: {},
        contentType: 'application/json',
      },
    });
    const { tsx, envVars } = generatePage(pageWith(boundQuery()), DEFAULT_THEME, {
      integrations: open,
    });

    expect(tsx).not.toContain('import.meta.env');
    expect(tsx).not.toContain('Authorization');
    expect(envVars).toEqual([]);
  });

  /**
   * The alternative — emitting a request with an empty URL — is the silent failure this
   * generator spends its warnings avoiding, and the same choice `staticOnly` makes for a
   * bound source prop.
   */
  it('leaves the query out and says so when the connection is gone', () => {
    const { tsx, warnings } = generatePage(pageWith(boundQuery()), DEFAULT_THEME, {
      integrations: {},
    });

    expect(tsx).not.toContain('useQuery(');
    expect(warnings).toEqual([
      'Query "users" was left out of the export because its API connection is no longer in this workspace.',
    ]);
  });

  it('says which endpoint went missing', () => {
    const emptied = integrations({ endpoints: {} });
    const { warnings } = generatePage(pageWith(boundQuery()), DEFAULT_THEME, {
      integrations: emptied,
    });

    expect(warnings[0]).toContain('the endpoint it calls on "Acme CRM" has been deleted');
  });

  it('declares the token once however many queries read it', () => {
    const page = pageWith(boundQuery());
    const two: Page = {
      ...page,
      queries: [...page.queries, { ...boundQuery(), id: 'q2', name: 'more' }],
    };
    const { tsx, envVars } = generatePage(two, DEFAULT_THEME, { integrations: integrations() });

    expect(tsx.match(/import\.meta\.env/g)).toHaveLength(1);
    expect(envVars).toEqual(['VITE_ACME_CRM_TOKEN']);
  });
});

describe('tokenConstName', () => {
  it.each([
    ['acme-crm', 'ACME_CRM_TOKEN'],
    ['stripe', 'STRIPE_TOKEN'],
    ['api-v2-internal', 'API_V2_INTERNAL_TOKEN'],
  ])('turns the slug %j into %j', (slug, expected) => {
    expect(tokenConstName(slug)).toBe(expected);
  });

  /** A slug may begin with a digit; an identifier may not. */
  it('keeps the identifier legal when the slug starts with a number', () => {
    expect(tokenConstName('2nd-api')).toBe('_2ND_API_TOKEN');
  });
});
