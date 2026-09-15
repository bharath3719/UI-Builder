import { describe, expect, it } from 'vitest';
import { POWERBI_SCOPE, type ApiAuth } from './api/integrations.js';
import {
  adaptQueryData,
  buildIntegrationRequest,
  buildQueryRequest,
  powerbiExecuteUrl,
  variableEvaluator,
  type IntegrationCatalog,
  type RequestConnection,
  type RequestEndpoint,
} from './integrationRequest.js';

function connection(overrides: Partial<RequestConnection> = {}): RequestConnection {
  return {
    baseUrl: 'https://api.acme.io',
    auth: { type: 'none' },
    defaultHeaders: {},
    contentType: 'application/json',
    ...overrides,
  };
}

function endpoint(overrides: Partial<RequestEndpoint> = {}): RequestEndpoint {
  return { method: 'GET', path: '/users', headers: {}, body: null, ...overrides };
}

/** No variables, so every `{{ }}` resolves to empty — the default for most cases here. */
const noVars = variableEvaluator({});

describe('buildIntegrationRequest', () => {
  it('joins the base URL to the endpoint path', () => {
    const request = buildIntegrationRequest(connection(), endpoint(), null, noVars);

    expect(request.url).toBe('https://api.acme.io/users');
    expect(request.method).toBe('GET');
  });

  /**
   * The reason `joinUrl` concatenates rather than using `new URL(path, base)`: URL
   * resolution treats a leading slash as "replace the path", which would silently drop
   * the `/v1` from every request.
   */
  it('keeps a path segment that is part of the base URL', () => {
    const request = buildIntegrationRequest(
      connection({ baseUrl: 'https://api.acme.io/v1' }),
      endpoint({ path: '/users' }),
      null,
      noVars,
    );

    expect(request.url).toBe('https://api.acme.io/v1/users');
  });

  it('interpolates templates in the path', () => {
    const request = buildIntegrationRequest(
      connection(),
      endpoint({ path: '/users/{{ userId }}' }),
      null,
      variableEvaluator({ userId: '42' }),
    );

    expect(request.url).toBe('https://api.acme.io/users/42');
  });

  it('interpolates templates in header values', () => {
    const request = buildIntegrationRequest(
      connection({ defaultHeaders: { 'X-Tenant': '{{ tenant }}' } }),
      endpoint(),
      null,
      variableEvaluator({ tenant: 'acme' }),
    );

    expect(request.headers['X-Tenant']).toBe('acme');
  });

  it("lets an endpoint's header beat the connection default of the same name", () => {
    const request = buildIntegrationRequest(
      connection({ defaultHeaders: { Accept: 'application/json' } }),
      endpoint({ headers: { Accept: 'text/csv' } }),
      null,
      noVars,
    );

    expect(request.headers.Accept).toBe('text/csv');
  });

  describe('auth', () => {
    it('sends a bearer token', () => {
      const request = buildIntegrationRequest(
        connection({ auth: { type: 'bearer' } }),
        endpoint(),
        'sk-live-123',
        noVars,
      );

      expect(request.headers.Authorization).toBe('Bearer sk-live-123');
    });

    /**
     * The expected values are literals rather than `btoa(...)` calls, and deliberately:
     * this package hand-rolls its base64 (it compiles against `lib: ["ES2023"]` and has
     * no `btoa`), so a test that computed the answer the same way the code does would
     * agree with any bug they shared.
     */
    it.each([
      ['hunter2', 'YWRhOmh1bnRlcjI=', 'ASCII'],
      ['pässwörd', 'YWRhOnDDpHNzd8O2cmQ=', 'two-byte code points'],
      ['🔑', 'YWRhOvCflJE=', 'a surrogate pair'],
      ['ab', 'YWRhOmFi', 'a length needing no padding'],
      ['a', 'YWRhOmE=', 'a length needing one pad character'],
    ])('encodes basic auth for %j (%s)', (secret, expected) => {
      const request = buildIntegrationRequest(
        connection({ auth: { type: 'basic', username: 'ada' } }),
        endpoint(),
        secret,
        noVars,
      );

      expect(request.headers.Authorization).toBe(`Basic ${expected}`);
    });

    it('sends an API key in a named header', () => {
      const auth: ApiAuth = { type: 'apiKey', in: 'header', name: 'X-Api-Key' };
      const request = buildIntegrationRequest(connection({ auth }), endpoint(), 'k123', noVars);

      expect(request.headers['X-Api-Key']).toBe('k123');
    });

    it('sends an API key as a query parameter', () => {
      const auth: ApiAuth = { type: 'apiKey', in: 'query', name: 'api_key' };
      const request = buildIntegrationRequest(connection({ auth }), endpoint(), 'k123', noVars);

      expect(request.url).toBe('https://api.acme.io/users?api_key=k123');
    });

    it('appends the key with & when the path already has a query string', () => {
      const auth: ApiAuth = { type: 'apiKey', in: 'query', name: 'api_key' };
      const request = buildIntegrationRequest(
        connection({ auth }),
        endpoint({ path: '/users?page=2' }),
        'k123',
        noVars,
      );

      expect(request.url).toBe('https://api.acme.io/users?page=2&api_key=k123');
    });

    it('escapes a key that would otherwise change the query string', () => {
      const auth: ApiAuth = { type: 'apiKey', in: 'query', name: 'api_key' };
      const request = buildIntegrationRequest(connection({ auth }), endpoint(), 'a&b=c', noVars);

      expect(request.url).toBe('https://api.acme.io/users?api_key=a%26b%3Dc');
    });

    /**
     * A missing credential produces a request without one rather than an error: the 401
     * that follows is the same failure the user will see when the token expires, and one
     * failure mode is easier to recognise than two.
     */
    it('omits auth entirely when no secret is stored', () => {
      const request = buildIntegrationRequest(
        connection({ auth: { type: 'bearer' } }),
        endpoint(),
        null,
        noVars,
      );

      expect(request.headers.Authorization).toBeUndefined();
    });

    it('sends nothing for the none scheme even when a secret exists', () => {
      const request = buildIntegrationRequest(connection(), endpoint(), 'leftover', noVars);

      expect(request.headers.Authorization).toBeUndefined();
      expect(request.url).toBe('https://api.acme.io/users');
    });
  });

  describe('bodies', () => {
    it('sends a body on POST and declares its content type', () => {
      const request = buildIntegrationRequest(
        connection(),
        endpoint({ method: 'POST', body: '{"name":"{{ name }}"}' }),
        null,
        variableEvaluator({ name: 'Ada' }),
      );

      expect(request.body).toBe('{"name":"Ada"}');
      expect(request.headers['Content-Type']).toBe('application/json');
    });

    it('drops a body on GET, which fetch would reject outright', () => {
      const request = buildIntegrationRequest(
        connection(),
        endpoint({ method: 'GET', body: '{"a":1}' }),
        null,
        noVars,
      );

      expect(request.body).toBeUndefined();
      expect(request.headers['Content-Type']).toBeUndefined();
    });

    it('declares no content type when there is no body to describe', () => {
      const request = buildIntegrationRequest(
        connection(),
        endpoint({ method: 'POST', body: '' }),
        null,
        noVars,
      );

      expect(request.body).toBeUndefined();
      expect(request.headers['Content-Type']).toBeUndefined();
    });

    it('honours an explicit Content-Type over the connection default', () => {
      const request = buildIntegrationRequest(
        connection(),
        endpoint({ method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: 'a,b' }),
        null,
        noVars,
      );

      expect(request.headers['Content-Type']).toBe('text/csv');
    });
  });
});

describe('variableEvaluator', () => {
  it('resolves a bare name, ignoring surrounding whitespace', () => {
    expect(variableEvaluator({ page: '2' })('  page  ')).toBe('2');
  });

  /** A half-filled test form should still show the request it would send. */
  it('resolves an unknown name to empty rather than throwing', () => {
    expect(variableEvaluator({})('missing')).toBe('');
  });
});

/* -------------------------------------------------------------------------- */
/* OAuth2, and Power BI                                                        */
/* -------------------------------------------------------------------------- */

const OAUTH: ApiAuth = {
  type: 'oauth2',
  tokenUrl: 'https://login.microsoftonline.com/t/oauth2/v2.0/token',
  clientId: 'app',
  scope: POWERBI_SCOPE,
};

describe('oauth2 auth', () => {
  /**
   * The whole of what this scheme means down here. By the time a request is built the
   * exchange has already happened on the server, so `secret` is an access token and the
   * only correct thing to do with it is what `bearer` does.
   */
  it('sends the minted token as a bearer', () => {
    const request = buildIntegrationRequest(
      connection({ auth: OAUTH }),
      endpoint(),
      'minted-token',
      noVars,
    );

    expect(request.headers.Authorization).toBe('Bearer minted-token');
  });

  it('sends no Authorization when there is no token yet', () => {
    const request = buildIntegrationRequest(connection({ auth: OAUTH }), endpoint(), null, noVars);

    expect(request.headers.Authorization).toBeUndefined();
  });
});

describe('powerbiExecuteUrl', () => {
  it('addresses a dataset in a workspace', () => {
    expect(powerbiExecuteUrl('https://api.powerbi.com', 'ds-1', 'grp-1')).toBe(
      'https://api.powerbi.com/v1.0/myorg/groups/grp-1/datasets/ds-1/executeQueries',
    );
  });

  it('addresses a dataset with no workspace', () => {
    expect(powerbiExecuteUrl('https://api.powerbi.com', 'ds-1', '')).toBe(
      'https://api.powerbi.com/v1.0/myorg/datasets/ds-1/executeQueries',
    );
  });

  it('encodes both ids, which are template output and can hold anything', () => {
    expect(powerbiExecuteUrl('https://api.powerbi.com', 'a/b', 'c d')).toContain(
      '/groups/c%20d/datasets/a%2Fb/',
    );
  });
});

describe('buildQueryRequest for a Power BI source', () => {
  const catalog: IntegrationCatalog = {
    pbi: {
      connection: {
        baseUrl: 'https://api.powerbi.com',
        auth: OAUTH,
        defaultHeaders: { 'X-Trace': 'on' },
        // Deliberately not JSON: the body's content type is the Power BI API's decision,
        // not this connection's, and a 415 is what it would cost to get that wrong.
        contentType: 'text/plain',
      },
      endpoints: {},
      secret: 'minted-token',
    },
  };

  const source = {
    kind: 'powerbi',
    integrationId: 'pbi',
    datasetId: 'ds-1',
    groupId: 'grp-1',
    dax: 'EVALUATE Sales',
  } as const;

  /** Page scope, standing in for the real evaluator. */
  const scope = (values: Record<string, string>) => (code: string) => values[code.trim()] ?? '';

  it('posts the DAX to the dataset it names', () => {
    const built = buildQueryRequest(source, catalog, scope({}));
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.request.method).toBe('POST');
    expect(built.request.url).toBe(
      'https://api.powerbi.com/v1.0/myorg/groups/grp-1/datasets/ds-1/executeQueries',
    );
    expect(JSON.parse(built.request.body ?? '')).toEqual({
      queries: [{ query: 'EVALUATE Sales' }],
      serializerSettings: { includeNulls: true },
    });
  });

  it('sends JSON whatever the connection is configured for, plus its default headers', () => {
    const built = buildQueryRequest(source, catalog, scope({}));
    if (!built.ok) throw new Error('expected a request');

    expect(built.request.headers['Content-Type']).toBe('application/json');
    expect(built.request.headers['X-Trace']).toBe('on');
    expect(built.request.headers.Authorization).toBe('Bearer minted-token');
  });

  it('interpolates page scope into the DAX, the dataset and the workspace', () => {
    const built = buildQueryRequest(
      {
        kind: 'powerbi',
        integrationId: 'pbi',
        datasetId: '{{ state.dataset }}',
        groupId: '{{ state.group }}',
        dax: 'EVALUATE TOPN({{ state.limit }}, Sales)',
      },
      catalog,
      scope({ 'state.dataset': 'ds-9', 'state.group': 'grp-9', 'state.limit': '10' }),
    );
    if (!built.ok) throw new Error('expected a request');

    expect(built.request.url).toContain('/groups/grp-9/datasets/ds-9/');
    expect(JSON.parse(built.request.body ?? '')).toMatchObject({
      queries: [{ query: 'EVALUATE TOPN(10, Sales)' }],
    });
  });

  it('asks for the rows to be unwrapped rather than pointed at', () => {
    const built = buildQueryRequest(source, catalog, scope({}));
    if (!built.ok) throw new Error('expected a request');

    expect(built.shape).toBe('powerbi');
    expect(built.resultPath).toBe('');
  });

  it('reports a connection that has gone rather than throwing', () => {
    const built = buildQueryRequest({ ...source, integrationId: 'other' }, catalog, scope({}));

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toContain('no longer available');
  });
});

describe('adaptQueryData', () => {
  it('leaves an ordinary response exactly as it arrived', () => {
    const body = { items: [{ id: 1 }] };
    expect(adaptQueryData('raw', body)).toBe(body);
  });

  it('unwraps a Power BI response into its rows', () => {
    expect(
      adaptQueryData('powerbi', {
        results: [{ tables: [{ rows: [{ 'Sales[Region]': 'North' }] }] }],
      }),
    ).toEqual([{ Region: 'North' }]);
  });
});
