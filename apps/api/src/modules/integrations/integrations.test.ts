import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POWERBI_SCOPE,
  type ApiErrorResponse,
  type ApiIntegrationSecret,
  type ApiIntegrationSummary,
  type TestApiEndpointResponse,
} from '@ui-builder/schema';
import { createTestApi, type TestApi } from '../../test/api.js';
import {
  addMember,
  createEndpoint,
  createIntegration,
  createWorkspace,
  createWorkspaceWithRoles,
} from '../../test/fixtures.js';

let api: TestApi;

beforeAll(async () => {
  api = await createTestApi();
});

afterAll(async () => {
  await api.close();
});

beforeEach(async () => {
  await api.reset();
});

describe('POST /api/workspaces/:id/integrations', () => {
  it('creates a connection and derives a slug from its name', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);

    const response = await api.post(`/api/workspaces/${workspace.id}/integrations`, {
      as: user,
      body: { name: 'Acme CRM', baseUrl: 'https://api.acme.io/v1' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<ApiIntegrationSummary>()).toMatchObject({
      name: 'Acme CRM',
      slug: 'acme-crm',
      baseUrl: 'https://api.acme.io/v1',
      auth: { type: 'none' },
      hasSecret: false,
      contentType: 'application/json',
      endpoints: [],
    });
  });

  it('strips a trailing slash so joining a path is one rule', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);

    const integration = await createIntegration(api, user, workspace.id, {
      baseUrl: 'https://api.acme.io/v1/',
    });

    expect(integration.baseUrl).toBe('https://api.acme.io/v1');
  });

  it('derives a distinct slug when the obvious one is taken', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);

    const first = await createIntegration(api, user, workspace.id, { name: 'Acme' });
    const second = await createIntegration(api, user, workspace.id, { name: 'Acme' });

    expect(first.slug).toBe('acme');
    expect(second.slug).toBe('acme-2');
  });

  /** The slug is scoped to the workspace, so two teams may each have an "acme". */
  it('allows the same slug in a different workspace', async () => {
    const user = await api.register();
    const first = await createWorkspace(api, user, { name: 'One' });
    const second = await createWorkspace(api, user, { name: 'Two' });

    const a = await createIntegration(api, user, first.id, { name: 'Acme' });
    const b = await createIntegration(api, user, second.id, { name: 'Acme' });

    expect(a.slug).toBe('acme');
    expect(b.slug).toBe('acme');
  });

  it('reports a clash instead of renaming when the slug was chosen explicitly', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    await createIntegration(api, user, workspace.id, { slug: 'acme' });

    const response = await api.post(`/api/workspaces/${workspace.id}/integrations`, {
      as: user,
      body: { name: 'Another', baseUrl: 'https://api.other.io', slug: 'acme' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<ApiErrorResponse>().error.code).toBe('conflict');
  });

  it.each([
    ['javascript:alert(1)'],
    ['file:///etc/passwd'],
    ['ftp://files.acme.io'],
    ['not a url'],
  ])('refuses %s as a base URL', async (baseUrl) => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);

    const response = await api.post(`/api/workspaces/${workspace.id}/integrations`, {
      as: user,
      body: { name: 'Bad', baseUrl },
    });

    expect(response.statusCode).toBe(400);
  });

  /**
   * A saved header must not be able to beat the auth scheme — that is both a confusing
   * failure and a way to keep a second credential outside the secret route.
   */
  it('refuses an Authorization header among the defaults', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);

    const response = await api.post(`/api/workspaces/${workspace.id}/integrations`, {
      as: user,
      body: {
        name: 'Acme',
        baseUrl: 'https://api.acme.io',
        defaultHeaders: { authorization: 'Bearer smuggled' },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses a header name containing a newline', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);

    const response = await api.post(`/api/workspaces/${workspace.id}/integrations`, {
      as: user,
      body: {
        name: 'Acme',
        baseUrl: 'https://api.acme.io',
        defaultHeaders: { 'X-Bad\nX-Injected': 'yes' },
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('secrets', () => {
  it('never returns the token alongside the connection', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);

    const integration = await createIntegration(api, user, workspace.id, {
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });

    expect(integration.hasSecret).toBe(true);
    expect(JSON.stringify(integration)).not.toContain('sk-live-123');
  });

  it('returns it from its own route', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });

    const response = await api.get(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/secret`,
      { as: user },
    );

    expect(response.statusCode).toBe(200);
    expect(response.json<ApiIntegrationSecret>().secret).toBe('sk-live-123');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('stores it encrypted rather than as text', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });

    const row = await api.db.apiIntegration.findUniqueOrThrow({
      where: { id: integration.id },
      select: { secretCipher: true },
    });

    expect(row.secretCipher).not.toBeNull();
    expect(Buffer.from(row.secretCipher!).toString('utf8')).not.toContain('sk-live-123');
  });

  it('leaves the stored token alone when an update does not mention it', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });

    await api.patch(`/api/workspaces/${workspace.id}/integrations/${integration.id}`, {
      as: user,
      body: { name: 'Renamed' },
    });

    const response = await api.get(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/secret`,
      { as: user },
    );

    expect(response.json<ApiIntegrationSecret>().secret).toBe('sk-live-123');
  });

  it('clears it when the update sends null', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });

    const updated = await api.patch(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}`,
      { as: user, body: { secret: null } },
    );

    expect(updated.json<ApiIntegrationSummary>().hasSecret).toBe(false);
  });

  /** A token nothing can ever send is a credential retained for no reason. */
  it('retires the token when the scheme is switched to none', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });

    const updated = await api.patch(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}`,
      { as: user, body: { auth: { type: 'none' } } },
    );

    expect(updated.json<ApiIntegrationSummary>().hasSecret).toBe(false);
  });

  it('does not store a secret sent alongside the none scheme', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);

    const integration = await createIntegration(api, user, workspace.id, {
      auth: { type: 'none' },
      secret: 'pointless',
    });

    expect(integration.hasSecret).toBe(false);
  });
});

describe('endpoints', () => {
  it('creates one under its integration and lists it with the connection', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id);

    await createEndpoint(api, user, workspace.id, integration.id, {
      name: 'List users',
      method: 'GET',
      path: '/users',
      resultPath: 'data.items',
    });

    const response = await api.get(`/api/workspaces/${workspace.id}/integrations`, { as: user });
    const [listed] = response.json<ApiIntegrationSummary[]>();

    expect(listed?.endpoints).toHaveLength(1);
    expect(listed?.endpoints[0]).toMatchObject({
      name: 'List users',
      method: 'GET',
      path: '/users',
      resultPath: 'data.items',
      sampleResponse: null,
    });
  });

  it('adds the leading slash a path was typed without', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id);

    const endpoint = await createEndpoint(api, user, workspace.id, integration.id, {
      path: 'users',
    });

    expect(endpoint.path).toBe('/users');
  });

  /** The base URL is a boundary, not a suggestion. */
  it('refuses an absolute URL as a path', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id);

    const response = await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints`,
      { as: user, body: { name: 'Escape', path: 'https://evil.example/steal' } },
    );

    expect(response.statusCode).toBe(400);
  });

  it('refuses a protocol-relative path', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id);

    const response = await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints`,
      { as: user, body: { name: 'Escape', path: '//evil.example/steal' } },
    );

    expect(response.statusCode).toBe(400);
  });

  it('refuses a result path that is not a field path', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id);

    const response = await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints`,
      { as: user, body: { name: 'Bad', resultPath: 'data; drop table' } },
    );

    expect(response.statusCode).toBe(400);
  });

  it('deletes its endpoints with it', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id);
    await createEndpoint(api, user, workspace.id, integration.id);

    await api.delete(`/api/workspaces/${workspace.id}/integrations/${integration.id}`, {
      as: user,
    });

    expect(await api.db.apiEndpoint.count()).toBe(0);
  });

  /**
   * The containment check. Without it an endpoint id would be actioned through any
   * integration the caller can reach, in any workspace they hold a role in.
   */
  it('refuses an endpoint id belonging to another integration', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const mine = await createIntegration(api, user, workspace.id, { name: 'Mine' });
    const other = await createIntegration(api, user, workspace.id, { name: 'Other' });
    const endpoint = await createEndpoint(api, user, workspace.id, other.id);

    const response = await api.patch(
      `/api/workspaces/${workspace.id}/integrations/${mine.id}/endpoints/${endpoint.id}`,
      { as: user, body: { name: 'Hijacked' } },
    );

    expect(response.statusCode).toBe(404);
  });
});

describe('access control', () => {
  it('lets a viewer read connections but not their secrets', async () => {
    const { workspace, owner, viewer } = await createWorkspaceWithRoles(api);
    const integration = await createIntegration(api, owner, workspace.id, {
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });

    const list = await api.get(`/api/workspaces/${workspace.id}/integrations`, { as: viewer });
    const secret = await api.get(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/secret`,
      { as: viewer },
    );

    expect(list.statusCode).toBe(200);
    expect(secret.statusCode).toBe(403);
  });

  it('refuses a viewer creating a connection', async () => {
    const { workspace, viewer } = await createWorkspaceWithRoles(api);

    const response = await api.post(`/api/workspaces/${workspace.id}/integrations`, {
      as: viewer,
      body: { name: 'Acme', baseUrl: 'https://api.acme.io' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('lets an editor create one and read its secret', async () => {
    const { workspace, editor } = await createWorkspaceWithRoles(api);

    const integration = await createIntegration(api, editor, workspace.id, {
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });
    const secret = await api.get(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/secret`,
      { as: editor },
    );

    expect(secret.json<ApiIntegrationSecret>().secret).toBe('sk-live-123');
  });

  it('refuses a non-member entirely', async () => {
    const { workspace, outsider } = await createWorkspaceWithRoles(api);

    const response = await api.get(`/api/workspaces/${workspace.id}/integrations`, {
      as: outsider,
    });

    expect(response.statusCode).toBe(403);
  });

  it('requires a signed-in user', async () => {
    const { workspace } = await createWorkspaceWithRoles(api);

    const response = await api.get(`/api/workspaces/${workspace.id}/integrations`);

    expect(response.statusCode).toBe(401);
  });

  /**
   * Reaching an integration through a workspace the caller *does* belong to must not
   * work: the id is checked against that workspace, not merely looked up.
   */
  it('refuses an integration id from another workspace', async () => {
    const attacker = await api.register();
    const victim = await api.register();

    const theirs = await createWorkspace(api, victim, { name: 'Theirs' });
    const integration = await createIntegration(api, victim, theirs.id, {
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });
    const ours = await createWorkspace(api, attacker, { name: 'Ours' });

    const response = await api.get(
      `/api/workspaces/${ours.id}/integrations/${integration.id}/secret`,
      { as: attacker },
    );

    expect(response.statusCode).toBe(404);
  });

  it('does not leak an integration through a workspace the caller was removed from', async () => {
    const owner = await api.register();
    const other = await api.register();
    const workspace = await createWorkspace(api, owner);
    const membership = await addMember(api, owner, workspace.id, other, 'EDITOR');
    const integration = await createIntegration(api, owner, workspace.id);

    await api.delete(`/api/workspaces/${workspace.id}/members/${membership.id}`, { as: owner });

    const response = await api.get(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}`,
      { as: other },
    );

    expect(response.statusCode).toBe(403);
  });
});

/* -------------------------------------------------------------------------- */
/* Test run                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A real HTTP server rather than a mocked `fetch`.
 *
 * The whole point of this route is that it makes a genuine outbound request with a
 * genuine credential attached, and a stubbed fetch would assert only that we called the
 * stub the way we thought we would. Here the assertions are on what actually arrived.
 */
describe('POST .../endpoints/:id/test', () => {
  let server: Server;
  let origin: string;
  let received: { url: string; method: string; headers: IncomingMessage['headers']; body: string };
  let respond: (response: ServerResponse) => void;

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received = {
          url: request.url ?? '',
          method: request.method ?? '',
          headers: request.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        };
        respond(response);
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    respond = (response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: { items: [{ id: 1, name: 'Ada' }] } }));
    };
  });

  it('sends the request and keeps the response as the endpoint sample', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, { baseUrl: origin });
    const endpoint = await createEndpoint(api, user, workspace.id, integration.id, {
      path: '/users',
    });

    const response = await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints/${endpoint.id}/test`,
      { as: user, body: {} },
    );

    const result = response.json<TestApiEndpointResponse>();
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.saved).toBe(true);
    expect(result.body).toEqual({ data: { items: [{ id: 1, name: 'Ada' }] } });
    expect(received.url).toBe('/users');

    const stored = await api.db.apiEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(stored.sampleResponse).toEqual({ data: { items: [{ id: 1, name: 'Ada' }] } });
    expect(stored.sampledAt).not.toBeNull();
  });

  it('attaches the stored bearer token to the real request', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      baseUrl: origin,
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });
    const endpoint = await createEndpoint(api, user, workspace.id, integration.id);

    await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints/${endpoint.id}/test`,
      { as: user, body: {} },
    );

    expect(received.headers.authorization).toBe('Bearer sk-live-123');
  });

  it('resolves template holes from the supplied variables', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, { baseUrl: origin });
    const endpoint = await createEndpoint(api, user, workspace.id, integration.id, {
      path: '/users/{{ userId }}',
    });

    const response = await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints/${endpoint.id}/test`,
      { as: user, body: { variables: { userId: '42' } } },
    );

    expect(received.url).toBe('/users/42');
    expect(response.json<TestApiEndpointResponse>().requestUrl).toBe(`${origin}/users/42`);
  });

  it('sends a POST body with the connection content type', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, { baseUrl: origin });
    const endpoint = await createEndpoint(api, user, workspace.id, integration.id, {
      method: 'POST',
      path: '/users',
      body: '{"name":"{{ name }}"}',
    });

    await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints/${endpoint.id}/test`,
      { as: user, body: { variables: { name: 'Ada' } } },
    );

    expect(received.method).toBe('POST');
    expect(received.body).toBe('{"name":"Ada"}');
    expect(received.headers['content-type']).toBe('application/json');
  });

  /** A 500's error envelope is not the shape the field picker should start offering. */
  it('does not overwrite a good sample with a failed response', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, { baseUrl: origin });
    const endpoint = await createEndpoint(api, user, workspace.id, integration.id);

    const url = `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints/${endpoint.id}/test`;
    await api.post(url, { as: user, body: {} });

    respond = (response) => {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: 'boom' }));
    };
    const second = await api.post(url, { as: user, body: {} });

    const result = second.json<TestApiEndpointResponse>();
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.saved).toBe(false);

    const stored = await api.db.apiEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(stored.sampleResponse).toEqual({ data: { items: [{ id: 1, name: 'Ada' }] } });
  });

  it('leaves the sample alone when asked not to save', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, { baseUrl: origin });
    const endpoint = await createEndpoint(api, user, workspace.id, integration.id);

    const response = await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints/${endpoint.id}/test`,
      { as: user, body: { save: false } },
    );

    expect(response.json<TestApiEndpointResponse>().saved).toBe(false);
    const stored = await api.db.apiEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(stored.sampleResponse).toBeNull();
  });

  /** A transport failure is a result to render, not an exception that loses the URL. */
  it('reports an unreachable host as a failed run rather than a 500', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      baseUrl: 'http://127.0.0.1:1',
    });
    const endpoint = await createEndpoint(api, user, workspace.id, integration.id);

    const response = await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints/${endpoint.id}/test`,
      { as: user, body: {} },
    );

    expect(response.statusCode).toBe(200);
    const result = response.json<TestApiEndpointResponse>();
    expect(result.ok).toBe(false);
    expect(result.error).not.toBeNull();
    expect(result.requestUrl).toBe('http://127.0.0.1:1/users');
  });

  it('returns a non-JSON body as text', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, { baseUrl: origin });
    const endpoint = await createEndpoint(api, user, workspace.id, integration.id);

    respond = (response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('just words');
    };

    const response = await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints/${endpoint.id}/test`,
      { as: user, body: {} },
    );

    expect(response.json<TestApiEndpointResponse>().body).toBe('just words');
  });

  it('refuses a viewer, who would otherwise spend the workspace credential', async () => {
    const { workspace, owner, viewer } = await createWorkspaceWithRoles(api);
    const integration = await createIntegration(api, owner, workspace.id, { baseUrl: origin });
    const endpoint = await createEndpoint(api, owner, workspace.id, integration.id);

    const response = await api.post(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/endpoints/${endpoint.id}/test`,
      { as: viewer, body: {} },
    );

    expect(response.statusCode).toBe(403);
  });
});

/* -------------------------------------------------------------------------- */
/* OAuth2 client credentials                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The scheme where "read the credential" is an outbound call rather than a decrypt.
 *
 * `fetch` is stubbed here rather than answered by the local server above, because the
 * token endpoint must be https — a client secret goes out on that request, and the
 * contract refuses anything else. What is under test is the route's half of the exchange:
 * that the client secret does not leave, that what does is the minted token, and that a
 * refusal arrives as something the studio can show.
 */
describe('oauth2 connections', () => {
  const OAUTH = {
    type: 'oauth2' as const,
    tokenUrl: 'https://login.example.test/oauth2/v2.0/token',
    clientId: 'client-1',
    scope: POWERBI_SCOPE,
  };

  /** What the authorization server sent, so the assertions can be on what arrived. */
  let sent: string[];

  beforeEach(() => {
    sent = [];
    vi.stubGlobal('fetch', async (_url: unknown, init: { body?: string }) => {
      sent.push(init.body ?? '');
      return new Response(JSON.stringify({ access_token: 'minted-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a minted access token rather than the client secret', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      auth: OAUTH,
      secret: 'client-secret-123',
    });

    const response = await api.get(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/secret`,
      { as: user },
    );

    expect(response.statusCode).toBe(200);

    const body = response.json<ApiIntegrationSecret>();
    expect(body.secret).toBe('minted-token');
    expect(body.expiresAt).not.toBeNull();

    // The claim the whole scheme rests on, asserted against the bytes rather than the field.
    expect(response.body).not.toContain('client-secret-123');

    // And the client secret did leave — to the authorization server, which is the only
    // place it is supposed to go.
    expect(sent[0]).toContain('client_secret=client-secret-123');
  });

  it('says when the token expires, which the other schemes cannot', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);

    const oauth = await createIntegration(api, user, workspace.id, {
      auth: OAUTH,
      secret: 'client-secret-123',
    });
    const bearer = await createIntegration(api, user, workspace.id, {
      name: 'Plain bearer',
      auth: { type: 'bearer' },
      secret: 'sk-live-123',
    });

    const minted = await api.get(
      `/api/workspaces/${workspace.id}/integrations/${oauth.id}/secret`,
      { as: user },
    );
    const pasted = await api.get(
      `/api/workspaces/${workspace.id}/integrations/${bearer.id}/secret`,
      { as: user },
    );

    const expiry = minted.json<ApiIntegrationSecret>().expiresAt;
    expect(expiry).not.toBeNull();
    expect(Date.parse(expiry!)).toBeGreaterThan(Date.now());

    // Not a claim that a pasted token is eternal — the honest statement that nobody told us.
    expect(pasted.json<ApiIntegrationSecret>().expiresAt).toBeNull();
  });

  it('reports a refused client secret as something the panel can show', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      auth: OAUTH,
      secret: 'wrong',
    });

    vi.stubGlobal('fetch', async () => {
      return new Response(
        JSON.stringify({
          error: 'invalid_client',
          error_description: 'AADSTS7000215: Invalid client secret provided.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const response = await api.get(
      `/api/workspaces/${workspace.id}/integrations/${integration.id}/secret`,
      { as: user },
    );

    expect(response.statusCode).toBe(503);
    expect(response.json<ApiErrorResponse>().error.message).toContain('AADSTS7000215');
  });

  it('mints once for a connection, however often it is read', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      auth: OAUTH,
      secret: 'client-secret-123',
    });

    const url = `/api/workspaces/${workspace.id}/integrations/${integration.id}/secret`;
    await api.get(url, { as: user });
    await api.get(url, { as: user });

    expect(sent).toHaveLength(1);
  });

  /** Rotating a secret has to make the old token unreachable now, not on its next read. */
  it('drops the cached token when the connection is changed', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);
    const integration = await createIntegration(api, user, workspace.id, {
      auth: OAUTH,
      secret: 'client-secret-123',
    });

    const url = `/api/workspaces/${workspace.id}/integrations/${integration.id}/secret`;
    await api.get(url, { as: user });

    await api.patch(`/api/workspaces/${workspace.id}/integrations/${integration.id}`, {
      as: user,
      body: { secret: 'rotated-456' },
    });
    await api.get(url, { as: user });

    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain('client_secret=rotated-456');
  });

  it('refuses a token URL that is not https', async () => {
    const user = await api.register();
    const workspace = await createWorkspace(api, user);

    const response = await api.post(`/api/workspaces/${workspace.id}/integrations`, {
      as: user,
      body: {
        name: 'Insecure',
        baseUrl: 'https://api.powerbi.com',
        auth: { ...OAUTH, tokenUrl: 'http://login.example.test/token' },
        secret: 'client-secret-123',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
