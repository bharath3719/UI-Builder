/**
 * Resolving a workspace integration into code an exported project can run.
 *
 * An export is handed to someone else. It cannot call back to this API, it has no
 * integration catalogue to look things up in, and it must not carry anyone's credentials —
 * so everything about a connection except its token is folded into the generated request
 * at build time, and the token becomes an environment variable the recipient supplies.
 *
 * That is the honest consequence of the call path this product chose. A server-side proxy
 * would have kept the token out of the client entirely, but the browser makes the call, so
 * the exported browser app needs the token the same way the studio does. What the export
 * gains over the studio is that the value is *not in the source*: it is read from
 * `import.meta.env`, and `.env.example` says which ones to set.
 */

import {
  composeEndpointTemplate,
  type ApiAuth,
  type ApiIntegrationSummary,
  type IntegrationQuerySource,
  type RequestConnection,
  type RequestEndpoint,
} from '@ui-builder/schema';

/** A connection as the generator needs it — configuration, and no secret anywhere. */
export interface ExportIntegration {
  /** The stable slug, which is what the environment variable is named after. */
  slug: string;
  name: string;
  connection: RequestConnection;
  endpoints: Readonly<Record<string, RequestEndpoint & { resultPath: string }>>;
}

/** Keyed by integration id, matching how a `QueryDef` references one. */
export type ExportIntegrations = Readonly<Record<string, ExportIntegration>>;

/**
 * Builds the generator's view from the API's own summaries.
 *
 * Shared by the two callers that generate a project — the API's zip route and the studio's
 * code panel — because a download and the code shown on screen must be the same bytes, and
 * this mapping is the one place either could have got it wrong.
 *
 * Note what it does not need: a secret. `ApiIntegrationSummary` does not carry one and the
 * generated code does not want one, because the token becomes an environment variable. So
 * this is safe to call anywhere the connection list is already loaded.
 */
export function exportIntegrationsFrom(
  summaries: readonly ApiIntegrationSummary[],
): ExportIntegrations {
  const out: Record<string, ExportIntegration> = {};

  for (const summary of summaries) {
    const endpoints: Record<string, RequestEndpoint & { resultPath: string }> = {};
    for (const endpoint of summary.endpoints) {
      endpoints[endpoint.id] = {
        method: endpoint.method,
        path: endpoint.path,
        headers: endpoint.headers,
        body: endpoint.body,
        resultPath: endpoint.resultPath,
      };
    }

    out[summary.id] = {
      slug: summary.slug,
      name: summary.name,
      connection: {
        baseUrl: summary.baseUrl,
        auth: summary.auth,
        defaultHeaders: summary.defaultHeaders,
        contentType: summary.contentType,
      },
      endpoints,
    };
  }

  return out;
}

/**
 * `VITE_` prefixed because that is the only way Vite exposes a variable to client code,
 * and the generated project is a Vite app. Derived from the slug rather than the display
 * name so that renaming "Acme CRM" to "Acme CRM (prod)" does not rename the variable a
 * deployment already sets.
 */
export function envVarName(slug: string): string {
  return `VITE_${slug.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}_TOKEN`;
}

/** The identifier the generated module binds that variable to. */
export function tokenConstName(slug: string): string {
  const base = slug.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  return `${/^[0-9]/.test(base) ? `_${base}` : base}_TOKEN`;
}

/**
 * A request with both template layers already folded together.
 *
 * `url`, the header values and `body` are template source in the *page's* scope — the
 * endpoint's own holes have been replaced by the expressions the page supplied for them
 * (`composeEndpointTemplate`). So everything downstream treats these exactly like a plain
 * URL query's fields, which is why `requestLiteral` needs one code path and not two.
 */
export interface ResolvedRequest {
  method: RequestEndpoint['method'];
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
  resultPath: string;
  /**
   * Code for the `Authorization` (or named) header's value, when the scheme needs one.
   * Kept apart from `headers` because it is JavaScript rather than template source: it
   * reads the token constant, which no template can name.
   */
  authHeader?: { name: string; code: string };
  /** For an API key sent as a query parameter: code appending it to the URL. */
  authQuery?: { name: string; code: string };
  /** The token constant this request reads, if any — so the page can declare it once. */
  tokenConst?: string;
}

function joinUrl(baseUrl: string, path: string): string {
  if (path === '') return baseUrl;
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * How the scheme reads its token, as code.
 *
 * Basic auth calls `btoa` on a string the generator already knows half of, which is the
 * one place the export is weaker than the studio: `btoa` throws above U+00FF, so a
 * password with an accent in it fails in the exported app where it works on the canvas.
 * Shipping the hand-rolled UTF-8 base64 into every export to cover it would add twenty
 * lines to a file most people read, for a case a username/password API in a browser app
 * is already an unusual way to reach. It is recorded here rather than silently left out.
 */
function authCode(
  auth: ApiAuth,
  constName: string,
): Pick<ResolvedRequest, 'authHeader' | 'authQuery'> {
  if (auth.type === 'bearer') {
    return { authHeader: { name: 'Authorization', code: `\`Bearer \${${constName}}\`` } };
  }
  if (auth.type === 'basic') {
    return {
      authHeader: {
        name: 'Authorization',
        code: `\`Basic \${btoa(${JSON.stringify(`${auth.username}:`)} + ${constName})}\``,
      },
    };
  }
  if (auth.type === 'apiKey') {
    return auth.in === 'header'
      ? { authHeader: { name: auth.name, code: constName } }
      : { authQuery: { name: auth.name, code: constName } };
  }
  return {};
}

/** Why a query could not be resolved — reported as a generation warning, never a throw. */
export type ResolveResult = { ok: true; request: ResolvedRequest } | { ok: false; reason: string };

export function resolveIntegrationRequest(
  source: IntegrationQuerySource,
  integrations: ExportIntegrations,
): ResolveResult {
  const integration = integrations[source.integrationId];
  if (!integration) {
    return { ok: false, reason: 'its API connection is no longer in this workspace' };
  }

  const endpoint = integration.endpoints[source.endpointId];
  if (!endpoint) {
    return { ok: false, reason: `the endpoint it calls on "${integration.name}" has been deleted` };
  }

  const variables = source.variables ?? {};
  const compose = (template: string): string => composeEndpointTemplate(template, variables);

  // Connection defaults first, so an endpoint's own header of the same name wins — the
  // same precedence `buildIntegrationRequest` applies at run time.
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(integration.connection.defaultHeaders)) {
    headers[name] = compose(value);
  }
  for (const [name, value] of Object.entries(endpoint.headers)) {
    headers[name] = compose(value);
  }

  const needsToken = integration.connection.auth.type !== 'none';
  const constName = tokenConstName(integration.slug);
  const auth = needsToken ? authCode(integration.connection.auth, constName) : {};

  const rawBody = endpoint.body === null ? undefined : compose(endpoint.body);
  const sendsBody =
    endpoint.method === 'POST' || endpoint.method === 'PUT' || endpoint.method === 'PATCH';

  return {
    ok: true,
    request: {
      method: endpoint.method,
      url: joinUrl(integration.connection.baseUrl, compose(endpoint.path)),
      headers,
      body: sendsBody && rawBody !== undefined && rawBody !== '' ? rawBody : undefined,
      resultPath: endpoint.resultPath,
      ...auth,
      ...(needsToken ? { tokenConst: constName } : {}),
    },
  };
}
