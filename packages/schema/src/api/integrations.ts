/**
 * Workspace API integrations — a saved connection to an outside HTTP API, and the named
 * calls on it.
 *
 * These are a *workspace* resource rather than something a page carries, because the
 * whole point is reuse: one team defines "Acme CRM" once, with its base URL, its auth and
 * its endpoints, and every project in the workspace binds to those endpoints instead of
 * re-typing a URL per page. `QueryDef` (doc.ts) grows an arm that references one of these
 * by id.
 *
 * Two shapes here, matching that split:
 *
 *   ApiIntegration  — the connection: base URL, auth scheme, default headers.
 *   ApiEndpoint     — one call on it: method, path, body, and where its rows live.
 *
 * ## Secrets
 *
 * The token is never part of `ApiIntegrationSummary`. It is stored encrypted, served only
 * by its own route, and only to a caller who may write the workspace — see
 * `REQUIRES.integrationSecretRead`. The studio fetches it at the moment a query runs.
 *
 * That is a narrower hole than it sounds and a wider one than a proxy would leave, and
 * the difference is a deliberate call recorded in PLAN.md: the runtime call is made by the
 * browser, so the browser must be handed the credential. What this shape *does* guarantee
 * is that the secret never enters a `ProjectDoc` — so revisions, publishes and exported
 * zips do not carry it, and rotating it does not mean editing documents.
 */

import { z } from 'zod';
import { HTTP_METHODS, JsonSchema } from '../doc.js';
import { DisplayName, Id, Slug } from './common.js';

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export const API_AUTH_TYPES = ['none', 'bearer', 'apiKey', 'basic'] as const;
export type ApiAuthType = (typeof API_AUTH_TYPES)[number];

/**
 * How a request proves who it is — the parts that are *not* the secret.
 *
 * A discriminated union rather than a bag of optional fields, because "an apiKey auth
 * with no header name" is a state that should not be representable: it is a connection
 * that will fail at run time with nothing to point at. The secret is deliberately absent
 * from every arm; it travels by itself, and that separation is what lets this object be
 * returned to anyone who can read the workspace.
 */
export const ApiAuth = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  /** `Authorization: Bearer <secret>`. */
  z.object({ type: z.literal('bearer') }),
  /** The secret goes in a named header or query parameter. */
  z.object({
    type: z.literal('apiKey'),
    in: z.enum(['header', 'query']),
    name: z.string().trim().min(1, 'is required').max(120, 'is too long'),
  }),
  /** `Authorization: Basic base64(username:secret)`. */
  z.object({
    type: z.literal('basic'),
    username: z.string().trim().min(1, 'is required').max(200, 'is too long'),
  }),
]);
export type ApiAuth = z.infer<typeof ApiAuth>;

/** True when this scheme has a credential to store at all. */
export function authNeedsSecret(auth: ApiAuth): boolean {
  return auth.type !== 'none';
}

/* -------------------------------------------------------------------------- */
/* Bodies                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What a request body is sent as. Named `contentType` because that is literally the
 * header it becomes, and a closed list because each one implies a different way of
 * encoding the body template the endpoint carries.
 */
export const API_CONTENT_TYPES = [
  'application/json',
  'application/x-www-form-urlencoded',
  'text/plain',
] as const;
export const ApiContentType = z.enum(API_CONTENT_TYPES);
export type ApiContentType = z.infer<typeof ApiContentType>;

/**
 * Header names a caller may not set on an integration.
 *
 * `Authorization` is owned by the auth scheme — accepting one here would let a saved
 * header quietly beat the credential the connection is configured with, which is a
 * confusing failure and a way to smuggle a second token past the secret route. The
 * hop-by-hop ones are the browser's to set, and naming them is a mistake worth catching
 * at the point it is typed.
 */
export const RESERVED_HEADERS = new Set([
  'authorization',
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'upgrade',
  'cookie',
]);

const HeaderName = z
  .string()
  .trim()
  .min(1, 'is required')
  .max(120, 'is too long')
  // RFC 7230 token. Rejecting the rest here means nothing downstream has to worry about a
  // newline in a header name, which is how a header-injection bug is written.
  .regex(/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/, 'is not a valid header name')
  .refine((name) => !RESERVED_HEADERS.has(name.toLowerCase()), 'is set automatically');

/** A header *value* is template source, so `{{ state.tenant }}` interpolates into it. */
const HeaderValue = z.string().max(2000, 'is too long');

export const ApiHeaders = z.record(HeaderName, HeaderValue);
export type ApiHeaders = z.infer<typeof ApiHeaders>;

/* -------------------------------------------------------------------------- */
/* URLs                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * An integration's base URL.
 *
 * `http` is allowed alongside `https` on purpose — a team pointing the builder at a
 * service on their own machine during development is the common case, and refusing it
 * would push them to a workaround rather than to TLS. Anything that is not one of the two
 * (a `javascript:` or `data:` URL) is refused, because this string is eventually handed
 * to `fetch`.
 */
export const BaseUrl = z
  .url('must be a URL')
  .max(500, 'is too long')
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    'must start with http:// or https://',
  )
  // Stored without it so joining a path is one rule rather than two: `baseUrl + path`.
  .transform((value) => value.replace(/\/+$/, ''));

/**
 * The path part of an endpoint, joined onto the integration's base URL.
 *
 * Template source, so `/users/{{ state.userId }}?q={{ state.search }}` is the point. It
 * must be relative: an absolute URL here would let an endpoint escape the connection it
 * belongs to, which makes the integration's base URL a suggestion rather than a boundary.
 */
export const EndpointPath = z
  .string()
  .trim()
  .max(1000, 'is too long')
  .refine((value) => !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value), 'must be a path, not a full URL')
  .refine((value) => !value.startsWith('//'), 'must be a path, not a full URL')
  .transform((value) => (value === '' || value.startsWith('/') ? value : `/${value}`));

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Where the rows are inside a response, as a dotted path — `data.items`, or `''` when the
 * response *is* the array.
 *
 * It exists so that binding a table to an endpoint is a choice made once, on the endpoint,
 * rather than re-derived in every page that uses it. The studio fills it in by looking at
 * a captured sample; it is stored because a sample can go stale and this cannot.
 */
export const ResultPath = z
  .string()
  .trim()
  .max(200, 'is too long')
  .regex(/^$|^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])*$/, 'is not a valid field path');

export const ApiEndpointSummary = z.object({
  id: Id,
  integrationId: Id,
  name: DisplayName,
  method: z.enum(HTTP_METHODS),
  path: z.string(),
  headers: ApiHeaders,
  /** Template source for the request body, or null for the methods that carry none. */
  body: z.string().nullable(),
  resultPath: z.string(),
  /**
   * One real response, captured by the test-run route and kept so the studio can offer
   * field names instead of asking someone to remember them. Null until a run succeeds.
   *
   * This is authoring-time convenience only: nothing at run time reads it, and a stale
   * sample can only mislead a person, never break a page.
   */
  sampleResponse: JsonSchema.nullable(),
  sampledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ApiEndpointSummary = z.infer<typeof ApiEndpointSummary>;

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

export const ApiIntegrationSummary = z.object({
  id: Id,
  workspaceId: Id,
  name: DisplayName,
  /**
   * Stable and slug-shaped, and load-bearing in exactly one place: codegen derives the
   * environment-variable name for this connection's token from it. Deriving that from
   * `name` instead would rename `VITE_API_TOKEN_ACME_CRM` the day someone fixes a typo in
   * a label, and silently break a deployed export.
   */
  slug: z.string(),
  baseUrl: z.string(),
  auth: ApiAuth,
  /**
   * Whether a credential is stored — never the credential. A panel needs to show "token
   * set" and offer to replace it, and that requires no access to the value.
   */
  hasSecret: z.boolean(),
  defaultHeaders: ApiHeaders,
  contentType: ApiContentType,
  /**
   * Embedded rather than fetched separately: every screen that lists integrations wants
   * their endpoints too (the Data panel's picker is one control over both levels), and a
   * workspace has tens of these, not thousands.
   */
  endpoints: z.array(ApiEndpointSummary),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ApiIntegrationSummary = z.infer<typeof ApiIntegrationSummary>;

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `undefined` leaves the stored secret alone, `null` clears it, a string replaces it.
 *
 * Spelled out because the three-way distinction is the whole reason an update route can
 * exist for a field it never reads back: without `null` there is no way to remove a token,
 * and without `undefined` every rename would have to re-send one.
 */
const SecretUpdate = z.string().min(1, 'is required').max(4000, 'is too long').nullable();

/**
 * The three request schemas below carry `.default()`s, which makes their input and output
 * types genuinely different — a caller may omit `contentType`, and the handler that
 * receives it never sees it missing. So each gets two names rather than one:
 *
 *   `…Request` is the parsed shape, with defaults applied — what a service takes.
 *   `…Input`   is what a caller has to provide — what the studio's client takes.
 *
 * Collapsing them to `z.infer` would make the client demand fields the server is there to
 * fill in, which is the error this comment exists to stop someone "fixing".
 */
export const CreateApiIntegrationRequest = z.object({
  name: DisplayName,
  /** Derived from `name` when omitted, with a numeric suffix if that is taken. */
  slug: Slug.optional(),
  baseUrl: BaseUrl,
  auth: ApiAuth.default({ type: 'none' }),
  secret: z.string().min(1).max(4000).optional(),
  defaultHeaders: ApiHeaders.default({}),
  contentType: ApiContentType.default('application/json'),
});
export type CreateApiIntegrationRequest = z.output<typeof CreateApiIntegrationRequest>;
export type CreateApiIntegrationInput = z.input<typeof CreateApiIntegrationRequest>;

export const UpdateApiIntegrationRequest = z
  .object({
    name: DisplayName.optional(),
    slug: Slug.optional(),
    baseUrl: BaseUrl.optional(),
    auth: ApiAuth.optional(),
    secret: SecretUpdate.optional(),
    defaultHeaders: ApiHeaders.optional(),
    contentType: ApiContentType.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'must change at least one field');
export type UpdateApiIntegrationRequest = z.infer<typeof UpdateApiIntegrationRequest>;

export const CreateApiEndpointRequest = z.object({
  name: DisplayName,
  method: z.enum(HTTP_METHODS).default('GET'),
  path: EndpointPath.default(''),
  headers: ApiHeaders.default({}),
  body: z.string().max(20000, 'is too long').nullable().default(null),
  resultPath: ResultPath.default(''),
});
export type CreateApiEndpointRequest = z.output<typeof CreateApiEndpointRequest>;
export type CreateApiEndpointInput = z.input<typeof CreateApiEndpointRequest>;

export const UpdateApiEndpointRequest = z
  .object({
    name: DisplayName.optional(),
    method: z.enum(HTTP_METHODS).optional(),
    path: EndpointPath.optional(),
    headers: ApiHeaders.optional(),
    body: z.string().max(20000, 'is too long').nullable().optional(),
    resultPath: ResultPath.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'must change at least one field');
export type UpdateApiEndpointRequest = z.infer<typeof UpdateApiEndpointRequest>;

/* -------------------------------------------------------------------------- */
/* The secret, and the test run                                                */
/* -------------------------------------------------------------------------- */

/** The one response that carries a credential. Its own route, its own type. */
export const ApiIntegrationSecret = z.object({
  integrationId: Id,
  /** Null when the connection has none stored — `auth: none`, or one never set. */
  secret: z.string().nullable(),
});
export type ApiIntegrationSecret = z.infer<typeof ApiIntegrationSecret>;

/**
 * A test run resolves the endpoint's templates against values supplied by the panel,
 * because at authoring time there is no page and therefore no `state` to read.
 */
export const TestApiEndpointRequest = z.object({
  /** Values for the `{{ }}` holes in the path, headers and body. */
  variables: z.record(z.string(), z.string()).default({}),
  /** Store the response as the endpoint's `sampleResponse` when it succeeds. */
  save: z.boolean().default(true),
});
export type TestApiEndpointRequest = z.output<typeof TestApiEndpointRequest>;
export type TestApiEndpointInput = z.input<typeof TestApiEndpointRequest>;

/**
 * What a test run reports.
 *
 * A transport failure is a *successful* API call that answers `ok: false` rather than an
 * error status, because "your endpoint is unreachable" is a result the panel has to render
 * next to the request it sent — not an exception that loses it.
 */
export const TestApiEndpointResponse = z.object({
  ok: z.boolean(),
  /** Null when the request never got a response at all. */
  status: z.number().int().nullable(),
  statusText: z.string(),
  /** What was actually sent, so the panel can show the resolved URL. */
  requestUrl: z.string(),
  durationMs: z.number().int().nonnegative(),
  headers: z.record(z.string(), z.string()),
  /** Parsed when the body was JSON, the raw text when it was not, null when empty. */
  body: JsonSchema.nullable(),
  /** Set when the request could not be made or completed. */
  error: z.string().nullable(),
  /** Whether `sampleResponse` was updated as a result. */
  saved: z.boolean(),
});
export type TestApiEndpointResponse = z.infer<typeof TestApiEndpointResponse>;
