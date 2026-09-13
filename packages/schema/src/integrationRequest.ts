/**
 * Turning an integration + endpoint into an actual HTTP request.
 *
 * There are two callers and they must not disagree. The API's test-run route builds a
 * request to show someone what their endpoint does; the browser builds the same request
 * when the page runs. If those two drifted, "it worked when I tested it" would be a
 * routine bug report rather than an impossible one — so this is one function, in the
 * package both sides already depend on. It is D6's argument (one style serializer shared
 * by runtime and codegen) applied to requests instead of CSS.
 *
 * Like `evaluateTemplate`, it takes its evaluator as an argument and contains no
 * `new Function` of its own. `schema` is imported by the API, and the API must never gain
 * the ability to run an expression a user typed (PLAN.md §13). The API passes a lookup
 * over supplied variables; the canvas passes the real evaluator inside its iframe.
 */

import type { ApiAuth, ApiContentType, ApiHeaders } from './api/integrations.js';
import type { HttpMethod } from './doc.js';
import { evaluateTemplate, stringifyValue, type EvaluateExpression } from './expr.js';

/** Just the parts of an integration a request is built from. */
export interface RequestConnection {
  baseUrl: string;
  auth: ApiAuth;
  defaultHeaders: ApiHeaders;
  contentType: ApiContentType;
}

/** Just the parts of an endpoint a request is built from. */
export interface RequestEndpoint {
  method: HttpMethod;
  path: string;
  headers: ApiHeaders;
  body: string | null;
}

export interface BuiltRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  /** Undefined for the methods that carry none, and for an endpoint with an empty body. */
  body: string | undefined;
}

/** A template that has to end up as a string — a URL, a header value, a body. */
function asText(source: string, evaluate: EvaluateExpression): string {
  return stringifyValue(evaluateTemplate(source, evaluate));
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * UTF-8 bytes for a string, by hand.
 *
 * `TextEncoder` would do this, and it exists in every realm this runs in — but it is not
 * in `lib: ["ES2023"]`, which is the only lib this package compiles against. That is not
 * an oversight to work around: "schema depends on nothing" (PLAN.md §2) is stated in the
 * tsconfig, and widening it to DOM or Node types so one function can call one global
 * would trade a real constraint for twenty lines. Surrogate pairs are combined first, so
 * an emoji in a password encodes as one four-byte sequence rather than two broken halves.
 */
function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];

  for (const character of input) {
    // Iterating a string yields whole code points, so `codePointAt(0)` is the character.
    const code = character.codePointAt(0) ?? 0;

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  return bytes;
}

/**
 * base64 of the UTF-8 bytes — what `Authorization: Basic` is defined as.
 *
 * Note that this is *not* `btoa(input)`: `btoa` throws on any code point above U+00FF, so
 * a password with an accent in it would fail here rather than at the far end.
 */
function base64Utf8(input: string): string {
  const bytes = utf8Bytes(input);
  let out = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    const remaining = bytes.length - index;

    out +=
      BASE64_ALPHABET[(triple >> 18) & 0x3f]! +
      BASE64_ALPHABET[(triple >> 12) & 0x3f]! +
      (remaining > 1 ? BASE64_ALPHABET[(triple >> 6) & 0x3f]! : '=') +
      (remaining > 2 ? BASE64_ALPHABET[triple & 0x3f]! : '=');
  }

  return out;
}

/**
 * Whether this method sends a body.
 *
 * GET and DELETE are excluded: `fetch` rejects a GET with a body outright, and a DELETE
 * body is legal but so unevenly supported that sending one silently is worse than not.
 */
function sendsBody(method: HttpMethod): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

/**
 * Joins the connection's base URL to the endpoint's resolved path.
 *
 * String concatenation rather than `new URL(path, base)`, and that is the load-bearing
 * choice: URL resolution treats a leading slash as "replace the whole path", so a base of
 * `https://api.acme.io/v1` and a path of `/users` would resolve to `/users` and quietly
 * drop the `/v1` every request needs. The base is stored without a trailing slash and the
 * path is stored with a leading one, so the two always meet exactly once.
 */
function joinUrl(baseUrl: string, path: string): string {
  if (path === '') return baseUrl;
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Appends a query parameter to a URL that may or may not already have some. */
function withQueryParam(url: string, name: string, value: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
}

/**
 * `secret` is the decrypted credential, or null when the connection has none.
 *
 * A scheme that needs one and has none produces a request *without* the credential rather
 * than throwing. The far end answering 401 is a clearer report than a builder error, and
 * it is the same thing the user will see once the token expires — one failure mode to
 * recognise instead of two.
 */
export function buildIntegrationRequest(
  connection: RequestConnection,
  endpoint: RequestEndpoint,
  secret: string | null,
  evaluate: EvaluateExpression,
): BuiltRequest {
  const headers: Record<string, string> = {};

  // Connection defaults first, so an endpoint's own header of the same name wins. That
  // ordering is the useful one: defaults are what every call shares, and an endpoint
  // naming a header again is saying this call is the exception.
  for (const [name, value] of Object.entries(connection.defaultHeaders)) {
    headers[name] = asText(value, evaluate);
  }
  for (const [name, value] of Object.entries(endpoint.headers)) {
    headers[name] = asText(value, evaluate);
  }

  let url = joinUrl(connection.baseUrl, asText(endpoint.path, evaluate));

  const auth = connection.auth;
  if (secret !== null && auth.type === 'bearer') {
    headers.Authorization = `Bearer ${secret}`;
  } else if (secret !== null && auth.type === 'basic') {
    headers.Authorization = `Basic ${base64Utf8(`${auth.username}:${secret}`)}`;
  } else if (secret !== null && auth.type === 'apiKey') {
    if (auth.in === 'header') headers[auth.name] = secret;
    else url = withQueryParam(url, auth.name, secret);
  }

  const raw = endpoint.body === null ? '' : asText(endpoint.body, evaluate);
  const body = sendsBody(endpoint.method) && raw !== '' ? raw : undefined;

  // Only when there is something to describe. Declaring a content type on a request with
  // no body makes some gateways expect one and wait for it.
  if (body !== undefined && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = connection.contentType;
  }

  return { method: endpoint.method, url, headers, body };
}

/**
 * An evaluator that resolves bare names against a flat map and nothing else.
 *
 * This is what the test-run route passes. At authoring time there is no page, so there is
 * no `state` and no `queries` to read — the panel collects a value for each hole and hands
 * them over. A hole naming something absent resolves to empty rather than throwing,
 * because a half-filled test form should still show the request it *would* send.
 */
export function variableEvaluator(variables: Readonly<Record<string, string>>): EvaluateExpression {
  return (code) => variables[code.trim()] ?? '';
}
