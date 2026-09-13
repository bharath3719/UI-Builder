import { describe, expect, it } from 'vitest';
import type { ApiAuth } from './api/integrations.js';
import {
  buildIntegrationRequest,
  variableEvaluator,
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
