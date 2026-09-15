import {
  DEFAULT_THEME,
  type EvaluateExpression,
  type IntegrationCatalog,
  type Json,
  type QueryDef,
  type QueryState,
  type UrlQuerySource,
} from '@ui-builder/schema';
import { describe, expect, it } from 'vitest';
import { createEvaluator } from './evaluate.js';
import { buildRequest as build, cyclicQueries } from './queries.js';

function evaluatorFor(state: Record<string, Json> = {}, queries: Record<string, QueryState> = {}) {
  return createEvaluator({ state, queries, props: {}, theme: DEFAULT_THEME });
}

/**
 * Most cases here are plain URL queries, whose request needs no catalogue at all — so the
 * evaluator stays the second argument and the catalogue is opt-in. The integration cases
 * below pass one explicitly.
 */
function buildRequest(
  query: QueryDef,
  evaluate: EvaluateExpression,
  catalog: IntegrationCatalog = {},
) {
  return build(query, catalog, evaluate);
}

/** Takes the URL source's own fields inline, which is what nearly every case varies. */
function query(
  init: Partial<UrlQuerySource> & Pick<QueryDef, 'id' | 'name'> & { runOnLoad?: boolean },
): QueryDef {
  const { id, name, runOnLoad = false, ...source } = init;

  return {
    id,
    name,
    runOnLoad,
    source: { kind: 'url', method: 'GET', url: '/api/thing', ...source },
  };
}

describe('buildRequest', () => {
  it('interpolates the url', () => {
    const request = buildRequest(
      query({ id: 'q1', name: 'user', url: '/api/users/{{ state.id }}' }),
      evaluatorFor({ id: 42 }),
    );

    expect(request.url).toBe('/api/users/42');
    expect(request.method).toBe('GET');
  });

  it('interpolates header values', () => {
    const request = buildRequest(
      query({ id: 'q1', name: 'user', headers: { Authorization: 'Bearer {{ state.token }}' } }),
      evaluatorFor({ token: 'abc' }),
    );

    expect(request.headers).toEqual({ Authorization: 'Bearer abc' });
  });

  it('interpolates the body', () => {
    const request = buildRequest(
      query({
        id: 'q1',
        name: 'save',
        method: 'POST',
        body: '{"name": "{{ state.name }}"}',
      }),
      evaluatorFor({ name: 'Ada' }),
    );

    expect(request.body).toBe('{"name": "Ada"}');
  });

  it('leaves a body-less query without one', () => {
    expect(buildRequest(query({ id: 'q1', name: 'list' }), evaluatorFor()).body).toBeUndefined();
  });

  it('has no headers when none are declared', () => {
    expect(buildRequest(query({ id: 'q1', name: 'list' }), evaluatorFor()).headers).toEqual({});
  });

  it('renders an unresolved binding as empty text rather than as "undefined"', () => {
    const request = buildRequest(
      query({ id: 'q1', name: 'user', url: '/api/users/{{ state.missing }}' }),
      evaluatorFor(),
    );

    expect(request.url).toBe('/api/users/');
  });

  it('reads another query, which is what chains one onto another', () => {
    const request = buildRequest(
      query({ id: 'q2', name: 'posts', url: '/api/users/{{ queries.user.data.id }}/posts' }),
      evaluatorFor({}, { user: { loading: false, data: { id: 9 }, error: undefined } }),
    );

    expect(request.url).toBe('/api/users/9/posts');
  });

  it('keys a request by everything the fetch depends on', () => {
    const definition = query({ id: 'q1', name: 'user', url: '/api/users/{{ state.id }}' });

    const first = buildRequest(definition, evaluatorFor({ id: 1 }));
    const same = buildRequest(definition, evaluatorFor({ id: 1 }));
    const other = buildRequest(definition, evaluatorFor({ id: 2 }));

    // Equal keys are what stop the auto-run effect re-fetching on every render...
    expect(first.key).toBe(same.key);
    // ...and a changed one is what makes a search box re-query with no wiring.
    expect(first.key).not.toBe(other.key);
  });

  it('keys on the method, the headers and the body too, not just the url', () => {
    const base = { id: 'q1', name: 'save', method: 'POST', body: '{}' } as const;
    const key = (over: Partial<UrlQuerySource> = {}) =>
      buildRequest(query({ ...base, ...over }), evaluatorFor()).key;

    expect(key()).not.toBe(key({ body: '{"a":1}' }));
    expect(key()).not.toBe(key({ method: 'PUT' }));
    expect(key()).not.toBe(key({ headers: { A: 'b' } }));
  });
});

describe('buildRequest against a workspace integration', () => {
  const catalog: IntegrationCatalog = {
    int1: {
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
      secret: 'sk-live-123',
    },
  };

  function bound(variables: Record<string, string> = {}): QueryDef {
    return {
      id: 'q1',
      name: 'users',
      runOnLoad: false,
      source: { kind: 'integration', integrationId: 'int1', endpointId: 'ep1', variables },
    };
  }

  it('joins the connection base URL to the endpoint path', () => {
    const request = buildRequest(bound(), evaluatorFor(), catalog);

    expect(request.url).toBe('https://api.acme.io/v1/users/');
    expect(request.headers.Accept).toBe('application/json');
  });

  /**
   * The two-stage evaluation. A page's `variables` are templates in *page* scope; the
   * endpoint's own templates then read the values those produced. Getting this wrong in
   * either direction is how "it worked when I tested it" would become a real bug report.
   */
  it('evaluates page variables in page scope, then the endpoint against them', () => {
    const request = buildRequest(
      bound({ userId: '{{ state.id }}' }),
      evaluatorFor({ id: 42 }),
      catalog,
    );

    expect(request.url).toBe('https://api.acme.io/v1/users/42');
  });

  it('attaches the connection credential, which the document never carries', () => {
    const request = buildRequest(bound(), evaluatorFor(), catalog);

    expect(request.headers.Authorization).toBe('Bearer sk-live-123');
  });

  it("carries the endpoint's result path, so a binding need not restate it", () => {
    expect(buildRequest(bound(), evaluatorFor(), catalog).resultPath).toBe('data.items');
  });

  it('re-keys when a page variable changes, so the query re-runs', () => {
    const first = buildRequest(
      bound({ userId: '{{ state.id }}' }),
      evaluatorFor({ id: 1 }),
      catalog,
    );
    const second = buildRequest(
      bound({ userId: '{{ state.id }}' }),
      evaluatorFor({ id: 2 }),
      catalog,
    );

    expect(first.key).not.toBe(second.key);
  });

  it('reports a missing connection rather than fetching nothing', () => {
    const request = buildRequest(bound(), evaluatorFor(), {});

    expect(request.error).toMatch(/no longer available/);
    expect(request.url).toBe('');
  });

  it('reports a deleted endpoint', () => {
    const emptied: IntegrationCatalog = { int1: { ...catalog.int1!, endpoints: {} } };
    const request = buildRequest(bound(), evaluatorFor(), emptied);

    expect(request.error).toMatch(/has been deleted/);
  });

  /**
   * An empty catalogue is the ordinary "still loading" state, so the key has to change
   * once it arrives — otherwise the auto-run effect would consider the query already sent.
   */
  it('changes its key once the catalogue loads', () => {
    const before = buildRequest(bound(), evaluatorFor(), {});
    const after = buildRequest(bound(), evaluatorFor(), catalog);

    expect(before.key).not.toBe(after.key);
  });

  it('sends no credential when the viewer may not read one', () => {
    const anonymous: IntegrationCatalog = { int1: { ...catalog.int1!, secret: null } };
    const request = buildRequest(bound(), evaluatorFor(), anonymous);

    expect(request.headers.Authorization).toBeUndefined();
  });
});

describe('cyclicQueries', () => {
  it('finds a query that reads its own result', () => {
    const self = query({ id: 'q1', name: 'users', url: '/api?page={{ queries.users.data.next }}' });
    expect([...cyclicQueries([self])]).toEqual(['q1']);
  });

  it('finds a cycle through another query', () => {
    const a = query({ id: 'qa', name: 'a', url: '/a/{{ queries.b.data }}' });
    const b = query({ id: 'qb', name: 'b', url: '/b/{{ queries.a.data }}' });
    expect(cyclicQueries([a, b])).toEqual(new Set(['qa', 'qb']));
  });

  it('allows a chain that does not come back round', () => {
    const a = query({ id: 'qa', name: 'a', url: '/a' });
    const b = query({ id: 'qb', name: 'b', url: '/b/{{ queries.a.data }}' });
    const c = query({ id: 'qc', name: 'c', url: '/c/{{ queries.b.data }}' });
    expect(cyclicQueries([a, b, c]).size).toBe(0);
  });

  it('sees a dependency in a header or a body, not only in the url', () => {
    const viaHeader = query({
      id: 'q1',
      name: 'users',
      headers: { Cursor: '{{ queries.users.data.next }}' },
    });
    expect([...cyclicQueries([viaHeader])]).toEqual(['q1']);

    const viaBody = query({
      id: 'q2',
      name: 'rows',
      method: 'POST',
      body: '{{ queries.rows.data }}',
    });
    expect([...cyclicQueries([viaBody])]).toEqual(['q2']);
  });

  it('ignores a reference to a query that does not exist', () => {
    const orphan = query({ id: 'q1', name: 'a', url: '/a/{{ queries.gone.data }}' });
    expect(cyclicQueries([orphan]).size).toBe(0);
  });

  it('reads state without calling it a dependency', () => {
    const plain = query({ id: 'q1', name: 'a', url: '/a/{{ state.id }}' });
    expect(cyclicQueries([plain]).size).toBe(0);
  });

  it('has nothing to say about no queries', () => {
    expect(cyclicQueries([]).size).toBe(0);
  });
});

/**
 * A Power BI query, from the request the hook would send to the shape the bindings see.
 *
 * `buildRequest` is what is reachable without rendering, and it is also where the two
 * facts worth pinning live: that the request carries the shape, and that the shape is what
 * makes `queries.sales.data` an array of rows rather than an envelope.
 */
describe('buildRequest for a Power BI query', () => {
  const catalog: IntegrationCatalog = {
    pbi: {
      connection: {
        baseUrl: 'https://api.powerbi.com',
        auth: {
          type: 'oauth2',
          tokenUrl: 'https://login.microsoftonline.com/t/oauth2/v2.0/token',
          clientId: 'app',
          scope: 'https://analysis.windows.net/powerbi/api/.default',
        },
        defaultHeaders: {},
        contentType: 'application/json',
      },
      endpoints: {},
      secret: 'minted-token',
    },
  };

  function dax(source: string, datasetId = 'ds-1'): QueryDef {
    return {
      id: 'q1',
      name: 'sales',
      runOnLoad: false,
      source: { kind: 'powerbi', integrationId: 'pbi', datasetId, groupId: 'grp-1', dax: source },
    };
  }

  it('posts the statement to the dataset, with the minted token', () => {
    const request = buildRequest(dax('EVALUATE Sales'), evaluatorFor(), catalog);

    expect(request.method).toBe('POST');
    expect(request.url).toBe(
      'https://api.powerbi.com/v1.0/myorg/groups/grp-1/datasets/ds-1/executeQueries',
    );
    expect(request.headers.Authorization).toBe('Bearer minted-token');
    expect(request.shape).toBe('powerbi');
  });

  it('reads page state inside the DAX, which is what makes a filter re-query', () => {
    const request = buildRequest(
      dax('EVALUATE FILTER(Sales, Sales[Region] = "{{ state.region }}")'),
      evaluatorFor({ region: 'North' }),
      catalog,
    );

    expect(request.body).toContain('Sales[Region] = \\"North\\"');
  });

  /**
   * The request key is what decides whether a render described a *new* request. A query
   * whose DAX reads state has to re-run when that state changes, and not otherwise.
   */
  it('changes its key when the state its DAX reads changes', () => {
    const query = dax('EVALUATE FILTER(Sales, Sales[Region] = "{{ state.region }}")');

    const north = buildRequest(query, evaluatorFor({ region: 'North' }), catalog);
    const alsoNorth = buildRequest(query, evaluatorFor({ region: 'North' }), catalog);
    const south = buildRequest(query, evaluatorFor({ region: 'South' }), catalog);

    expect(north.key).toBe(alsoNorth.key);
    expect(north.key).not.toBe(south.key);
  });

  it('reports a connection that is not in the catalogue yet', () => {
    const request = buildRequest(dax('EVALUATE Sales'), evaluatorFor(), {});

    expect(request.error).toContain('no longer available');
    expect(request.shape).toBe('raw');
  });

  it('leaves an ordinary query unshaped', () => {
    expect(buildRequest(query({ id: 'q1', name: 'a' }), evaluatorFor()).shape).toBe('raw');
  });
});
