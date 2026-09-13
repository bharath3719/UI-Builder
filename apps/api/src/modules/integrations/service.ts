import {
  ApiAuth,
  ApiHeaders,
  authNeedsSecret,
  buildIntegrationRequest,
  variableEvaluator,
  type ApiContentType,
  type ApiEndpointSummary,
  type ApiIntegrationSecret,
  type ApiIntegrationSummary,
  type CreateApiEndpointRequest,
  type CreateApiIntegrationRequest,
  type Json,
  type TestApiEndpointRequest,
  type TestApiEndpointResponse,
  type UpdateApiEndpointRequest,
  type UpdateApiIntegrationRequest,
} from '@ui-builder/schema';
import type { Db } from '../../db/client.js';
import type { WorkspaceAccess } from '../../lib/access.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { OutboundError, sendOutbound } from '../../lib/outbound.js';
import { decryptSecret, encryptSecret, SecretUnreadableError } from '../../lib/secrets.js';
import { resolveUniqueSlug } from '../../lib/slug.js';

/* -------------------------------------------------------------------------- */
/* Rows -> contract                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Prisma types a `Json` column as `JsonValue`, which is structurally what we stored but
 * not what the contract names. Re-parsing is the honest conversion: these columns are
 * written by this service and read by the studio, and a row hand-edited in psql — or
 * written by an older shape of this code — should be reported, not passed through.
 */
function readAuth(value: unknown): ApiAuth {
  const parsed = ApiAuth.safeParse(value);
  // A connection whose auth column is unreadable still has a name, a base URL and
  // endpoints worth listing. Degrading to `none` keeps the settings page openable so it
  // can be fixed there, which failing the whole request would not.
  return parsed.success ? parsed.data : { type: 'none' };
}

function readHeaders(value: unknown): Record<string, string> {
  const parsed = ApiHeaders.safeParse(value);
  return parsed.success ? parsed.data : {};
}

type EndpointRow = {
  id: string;
  integrationId: string;
  name: string;
  method: ApiEndpointSummary['method'];
  path: string;
  headers: unknown;
  body: string | null;
  resultPath: string;
  sampleResponse: unknown;
  sampledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toEndpointSummary(row: EndpointRow): ApiEndpointSummary {
  return {
    id: row.id,
    integrationId: row.integrationId,
    name: row.name,
    method: row.method,
    path: row.path,
    headers: readHeaders(row.headers),
    body: row.body,
    resultPath: row.resultPath,
    sampleResponse: (row.sampleResponse ?? null) as Json | null,
    sampledAt: row.sampledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type IntegrationRow = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  baseUrl: string;
  auth: unknown;
  secretCipher: Uint8Array | null;
  defaultHeaders: unknown;
  contentType: string;
  createdAt: Date;
  updatedAt: Date;
  endpoints: EndpointRow[];
};

function toIntegrationSummary(row: IntegrationRow): ApiIntegrationSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug,
    baseUrl: row.baseUrl,
    auth: readAuth(row.auth),
    // The one thing said about the credential without disclosing it.
    hasSecret: row.secretCipher !== null,
    defaultHeaders: readHeaders(row.defaultHeaders),
    contentType: row.contentType as ApiContentType,
    endpoints: row.endpoints.map(toEndpointSummary),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Endpoints come back in a stable order so a picker does not reshuffle between loads. */
const withEndpoints = { endpoints: { orderBy: { createdAt: 'asc' } } } as const;

/* -------------------------------------------------------------------------- */
/* Lookup                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Loads an integration and confirms it belongs to the workspace the caller proved access
 * to. The workspace check is the whole point: without it an id from another workspace
 * would be actioned by anyone holding the editor role anywhere.
 */
async function findIntegration(
  db: Db,
  access: WorkspaceAccess,
  integrationId: string,
): Promise<IntegrationRow> {
  const integration = await db.apiIntegration.findUnique({
    where: { id: integrationId },
    include: withEndpoints,
  });

  if (!integration || integration.workspaceId !== access.workspaceId) {
    throw new NotFoundError('That integration');
  }

  return integration;
}

/**
 * No database round trip: `findIntegration` already loaded the endpoints, and looking one
 * up again by id would find endpoints belonging to *other* integrations too — which is
 * the containment check this is here to make.
 */
function findEndpoint(integration: IntegrationRow, endpointId: string): EndpointRow {
  const endpoint = integration.endpoints.find((candidate) => candidate.id === endpointId);
  if (!endpoint) {
    throw new NotFoundError('That endpoint');
  }
  return endpoint;
}

async function isSlugTaken(
  db: Db,
  workspaceId: string,
  slug: string,
  exceptId?: string,
): Promise<boolean> {
  const existing = await db.apiIntegration.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: { id: true },
  });
  return existing != null && existing.id !== exceptId;
}

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

export async function listIntegrations(
  db: Db,
  access: WorkspaceAccess,
): Promise<ApiIntegrationSummary[]> {
  const rows = await db.apiIntegration.findMany({
    where: { workspaceId: access.workspaceId },
    include: withEndpoints,
    orderBy: { createdAt: 'asc' },
  });

  return rows.map(toIntegrationSummary);
}

export async function getIntegration(
  db: Db,
  access: WorkspaceAccess,
  integrationId: string,
): Promise<ApiIntegrationSummary> {
  return toIntegrationSummary(await findIntegration(db, access, integrationId));
}

export async function createIntegration(
  db: Db,
  access: WorkspaceAccess,
  input: CreateApiIntegrationRequest,
): Promise<ApiIntegrationSummary> {
  // An explicit slug is the user's choice, so a clash is worth reporting precisely rather
  // than silently renaming to `-2` — the same rule `createWorkspace` follows.
  if (input.slug && (await isSlugTaken(db, access.workspaceId, input.slug))) {
    throw new ConflictError(`The identifier "${input.slug}" is already used in this workspace.`);
  }

  const slug =
    input.slug ??
    (await resolveUniqueSlug(input.name, (candidate) =>
      isSlugTaken(db, access.workspaceId, candidate),
    ));

  const integration = await db.apiIntegration.create({
    data: {
      workspaceId: access.workspaceId,
      name: input.name,
      slug,
      baseUrl: input.baseUrl,
      auth: input.auth,
      defaultHeaders: input.defaultHeaders,
      contentType: input.contentType,
      // A secret sent alongside `auth: none` is dropped rather than stored: there is
      // nothing that would ever send it, and keeping it would be a credential retained
      // for no reason.
      secretCipher:
        input.secret !== undefined && authNeedsSecret(input.auth)
          ? encryptSecret(input.secret)
          : null,
    },
    include: withEndpoints,
  });

  return toIntegrationSummary(integration);
}

/**
 * `secret` is three-valued and each value means something different — see the contract.
 * Undefined leaves the stored bytes alone, null clears them, a string replaces them.
 */
function secretUpdate(
  input: UpdateApiIntegrationRequest,
  auth: ApiAuth,
): { secretCipher: Uint8Array<ArrayBuffer> | null } | Record<string, never> {
  // Switching to `none` retires the credential with it. Leaving it behind would mean a
  // token still sitting in the database that nothing can ever send — and that would come
  // back if the scheme were switched away from `none` again, which is a surprise.
  if (!authNeedsSecret(auth)) return { secretCipher: null };
  if (input.secret === undefined) return {};
  if (input.secret === null) return { secretCipher: null };
  return { secretCipher: encryptSecret(input.secret) };
}

export async function updateIntegration(
  db: Db,
  access: WorkspaceAccess,
  integrationId: string,
  input: UpdateApiIntegrationRequest,
): Promise<ApiIntegrationSummary> {
  const existing = await findIntegration(db, access, integrationId);

  if (input.slug && (await isSlugTaken(db, access.workspaceId, input.slug, integrationId))) {
    throw new ConflictError(`The identifier "${input.slug}" is already used in this workspace.`);
  }

  // The scheme the secret is being judged against is the one that will be stored, which
  // is the incoming one when the update changes it.
  const auth = input.auth ?? readAuth(existing.auth);

  const integration = await db.apiIntegration.update({
    where: { id: integrationId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
      ...(input.auth === undefined ? {} : { auth: input.auth }),
      ...(input.defaultHeaders === undefined ? {} : { defaultHeaders: input.defaultHeaders }),
      ...(input.contentType === undefined ? {} : { contentType: input.contentType }),
      ...secretUpdate(input, auth),
    },
    include: withEndpoints,
  });

  return toIntegrationSummary(integration);
}

/** Cascades to its endpoints (see the Prisma relation). */
export async function deleteIntegration(
  db: Db,
  access: WorkspaceAccess,
  integrationId: string,
): Promise<void> {
  await findIntegration(db, access, integrationId);
  await db.apiIntegration.delete({ where: { id: integrationId } });
}

/**
 * The one read that returns a credential.
 *
 * A row that will not decrypt reports itself as such rather than as an absent token: the
 * two need different fixes — enter it again versus set one for the first time — and
 * collapsing them into `null` would send someone looking in the wrong place.
 */
export async function readIntegrationSecret(
  db: Db,
  access: WorkspaceAccess,
  integrationId: string,
): Promise<ApiIntegrationSecret> {
  const integration = await findIntegration(db, access, integrationId);
  if (integration.secretCipher === null) return { integrationId, secret: null };

  return { integrationId, secret: decryptSecret(integration.secretCipher) };
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

export async function createEndpoint(
  db: Db,
  access: WorkspaceAccess,
  integrationId: string,
  input: CreateApiEndpointRequest,
): Promise<ApiEndpointSummary> {
  await findIntegration(db, access, integrationId);

  const endpoint = await db.apiEndpoint.create({
    data: {
      integrationId,
      name: input.name,
      method: input.method,
      path: input.path,
      headers: input.headers,
      body: input.body,
      resultPath: input.resultPath,
    },
  });

  return toEndpointSummary(endpoint);
}

export async function updateEndpoint(
  db: Db,
  access: WorkspaceAccess,
  integrationId: string,
  endpointId: string,
  input: UpdateApiEndpointRequest,
): Promise<ApiEndpointSummary> {
  const integration = await findIntegration(db, access, integrationId);
  findEndpoint(integration, endpointId);

  const endpoint = await db.apiEndpoint.update({
    where: { id: endpointId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.method === undefined ? {} : { method: input.method }),
      ...(input.path === undefined ? {} : { path: input.path }),
      ...(input.headers === undefined ? {} : { headers: input.headers }),
      ...(input.body === undefined ? {} : { body: input.body }),
      ...(input.resultPath === undefined ? {} : { resultPath: input.resultPath }),
    },
  });

  return toEndpointSummary(endpoint);
}

export async function deleteEndpoint(
  db: Db,
  access: WorkspaceAccess,
  integrationId: string,
  endpointId: string,
): Promise<void> {
  const integration = await findIntegration(db, access, integrationId);
  findEndpoint(integration, endpointId);

  await db.apiEndpoint.delete({ where: { id: endpointId } });
}

/* -------------------------------------------------------------------------- */
/* Test run                                                                    */
/* -------------------------------------------------------------------------- */

/** JSON when it parses, the raw text when it does not, null when the body was empty. */
function readResponseBody(text: string): Json | null {
  if (text === '') return null;
  try {
    return JSON.parse(text) as Json;
  } catch {
    return text;
  }
}

/**
 * Runs an endpoint once and, on success, keeps the response as its sample.
 *
 * This is the only server-side call to a third-party API in the product, and it exists
 * for one reason: the studio cannot offer "bind this column to `item.email`" without
 * having seen a real response, and asking the *browser* for one runs into the CORS wall
 * that the browser call path lives with. A server can always reach the endpoint, so the
 * sample is captured here even though every later call is made from the page.
 *
 * A transport failure is reported as a result with `ok: false`, not thrown. The panel has
 * to render "could not connect" next to the URL it tried, and an exception loses the URL.
 */
export async function testEndpoint(
  db: Db,
  access: WorkspaceAccess,
  integrationId: string,
  endpointId: string,
  input: TestApiEndpointRequest,
): Promise<TestApiEndpointResponse> {
  const integration = await findIntegration(db, access, integrationId);
  const endpoint = findEndpoint(integration, endpointId);

  let secret: string | null = null;
  if (integration.secretCipher !== null) {
    try {
      secret = decryptSecret(integration.secretCipher);
    } catch (error) {
      // Reported as a failed run rather than a 500: it is a fact about this connection
      // that the panel showing the run is exactly the place to fix.
      if (!(error instanceof SecretUnreadableError)) throw error;
      return {
        ok: false,
        status: null,
        statusText: '',
        requestUrl: '',
        durationMs: 0,
        headers: {},
        body: null,
        error: error.message,
        saved: false,
      };
    }
  }

  const request = buildIntegrationRequest(
    {
      baseUrl: integration.baseUrl,
      auth: readAuth(integration.auth),
      defaultHeaders: readHeaders(integration.defaultHeaders),
      contentType: integration.contentType as ApiContentType,
    },
    {
      method: endpoint.method,
      path: endpoint.path,
      headers: readHeaders(endpoint.headers),
      body: endpoint.body,
    },
    secret,
    variableEvaluator(input.variables),
  );

  try {
    const result = await sendOutbound(request);
    const body = readResponseBody(result.text);
    const ok = result.status >= 200 && result.status < 300;

    // Only a successful run replaces the sample. A 500's error envelope is not the shape
    // the field picker should start offering, and overwriting a good sample with one
    // would quietly break every binding suggestion afterwards.
    const saved = ok && input.save && body !== null;
    if (saved) {
      await db.apiEndpoint.update({
        where: { id: endpointId },
        data: { sampleResponse: body, sampledAt: new Date() },
      });
    }

    return {
      ok,
      status: result.status,
      statusText: result.statusText,
      requestUrl: request.url,
      durationMs: result.durationMs,
      headers: result.headers,
      body,
      error: null,
      saved,
    };
  } catch (error) {
    if (!(error instanceof OutboundError)) throw error;

    return {
      ok: false,
      status: null,
      statusText: '',
      requestUrl: request.url,
      durationMs: 0,
      headers: {},
      body: null,
      error: error.message,
      saved: false,
    };
  }
}
