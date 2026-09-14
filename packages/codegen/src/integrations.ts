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
  parseTemplate,
  powerbiExecuteUrl,
  powerbiQueryBody,
  type ApiAuth,
  type ApiIntegrationSummary,
  type IntegrationQuerySource,
  type PowerBiQuerySource,
  type RequestConnection,
  type RequestEndpoint,
} from '@ui-builder/schema';
import { stringLiteral } from './ir.js';

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
  /**
   * The URL and body as *code* rather than as template source, for the one request kind
   * whose parts are not something a person typed: a Power BI query's URL is assembled
   * around an id and its body is a JSON envelope, and both need `encodeURIComponent` and
   * `JSON.stringify` at the seams — which a template cannot say.
   *
   * When these are set they win over `url` and `body`, which are still filled in so that
   * anything reading a request for its shape (rather than to emit it) sees one.
   */
  urlCode?: string;
  bodyCode?: string;
  /**
   * The name of the function the response goes through before the page sees it, imported
   * from the generated `src/lib/powerbi.ts`. Absent for every request that needs none.
   */
  adapt?: string;
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
  // `oauth2` alongside `bearer`, and that is the whole of what an export can do with it.
  //
  // The studio's Power BI connection holds a *client secret* and trades it for an access
  // token on the server (`apps/api/src/lib/oauth.ts`). An exported project has no server,
  // and putting a client secret in a browser bundle so it could do the trade itself would
  // hand every visitor a credential for the whole application. So the export reads an
  // access token from the environment like any other bearer, and `.env.example` says so.
  // A deployment that wants the tokens refreshed puts something in front of this that
  // refreshes them — which is the same shape of answer as every other secret in an export.
  if (auth.type === 'bearer' || auth.type === 'oauth2') {
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

/* -------------------------------------------------------------------------- */
/* Power BI                                                                    */
/* -------------------------------------------------------------------------- */

/** The generated name of the row adapter, and of the module it is imported from. */
export const POWERBI_ADAPTER = 'powerbiRows';

/**
 * Turns template source into a JavaScript expression producing a string.
 *
 * Taken as an argument rather than imported, because doing it needs the page's helper set
 * — `text()` is declared once per module and only if something reached for it — and that
 * set lives with the page being generated. Same argument as `buildIntegrationRequest`
 * taking its evaluator: this file knows the shape of a request, not how to compile one.
 */
export type TextExpression = (template: string) => string;

/** True when a template has no holes, so its value is known while generating. */
function staticText(template: string): string | null {
  const segments = parseTemplate(template);
  if (!segments.every((segment) => segment.kind === 'text')) return null;
  return segments.map((segment) => (segment.kind === 'text' ? segment.text : '')).join('');
}

/**
 * A Power BI query as a request an exported page can make.
 *
 * The URL is written as a literal whenever the dataset and workspace are literals, which
 * is nearly always — a dataset id is a GUID somebody pasted, and a generated page reading
 * `'https://api.powerbi.com/v1.0/myorg/datasets/<id>/executeQueries'` says what it does at
 * a glance. Only a *bound* id falls back to concatenation, and then the encoding the
 * runtime applies is applied here too, so the two cannot disagree about a dataset id with
 * something awkward in it (D6).
 */
export function resolvePowerBiRequest(
  source: PowerBiQuerySource,
  integrations: ExportIntegrations,
  text: TextExpression,
): ResolveResult {
  const integration = integrations[source.integrationId];
  if (!integration) {
    return { ok: false, reason: 'its API connection is no longer in this workspace' };
  }

  const { baseUrl, auth, defaultHeaders } = integration.connection;
  const groupTemplate = source.groupId ?? '';

  const staticDataset = staticText(source.datasetId);
  const staticGroup = staticText(groupTemplate);

  const urlCode =
    staticDataset !== null && staticGroup !== null
      ? stringLiteral(powerbiExecuteUrl(baseUrl, staticDataset, staticGroup))
      : [
          stringLiteral(`${baseUrl}/v1.0/myorg`),
          ...(staticGroup === ''
            ? []
            : staticGroup !== null
              ? [stringLiteral(`/groups/${encodeURIComponent(staticGroup)}`)]
              : [stringLiteral('/groups/'), `encodeURIComponent(${text(groupTemplate)})`]),
          stringLiteral('/datasets/'),
          staticDataset !== null
            ? stringLiteral(encodeURIComponent(staticDataset))
            : `encodeURIComponent(${text(source.datasetId)})`,
          stringLiteral('/executeQueries'),
        ].join(' + ');

  const staticDax = staticText(source.dax);
  const bodyCode =
    staticDax !== null
      ? stringLiteral(powerbiQueryBody(staticDax))
      : `JSON.stringify({ queries: [{ query: ${text(source.dax)} }], serializerSettings: { includeNulls: true } })`;

  const needsToken = auth.type !== 'none';
  const constName = tokenConstName(integration.slug);

  return {
    ok: true,
    request: {
      method: 'POST',
      // Left as the URL a reader would recognise. `urlCode` is what is emitted; this is
      // what anything inspecting the request for its shape should see.
      url: powerbiExecuteUrl(baseUrl, source.datasetId, groupTemplate),
      urlCode,
      // Not the connection's `contentType`: this body is JSON because the Power BI API
      // says so, not because of how the connection was configured for its REST endpoints.
      headers: { ...defaultHeaders, 'Content-Type': 'application/json' },
      body: powerbiQueryBody(source.dax),
      bodyCode,
      adapt: POWERBI_ADAPTER,
      // The rows are moved to the top by the adapter, so there is no path left to follow.
      resultPath: '',
      ...(needsToken ? authCode(auth, constName) : {}),
      ...(needsToken ? { tokenConst: constName } : {}),
    },
  };
}
