import type { ZodType } from 'zod';
import {
  type ApiErrorCode,
  type ApiErrorDetail,
  ApiErrorResponse,
  AuthResponse,
} from '@ui-builder/schema';

/**
 * The client-side failure codes, alongside the server's. Both live in one union so a
 * caller switches once: "could not reach the API" and "the API said 403" are the same
 * kind of thing to the screen that has to explain it.
 */
export type FailureCode = ApiErrorCode | 'network_error' | 'contract_error';

/**
 * A failure that has already been turned into something worth showing a user.
 *
 * `message` is the sentence a person reads, and nothing else. That is a rule rather than a
 * description: `formErrorMessage` puts it straight into a banner, so anything technical
 * that reaches it is technical text on screen — which is how "The API responded 429 in an
 * unrecognised shape." came to be an answer the sign-in form gave. Where the useful detail
 * is developer-facing it goes in {@link detail} and to the console, never into `message`.
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly code: FailureCode;
  /** Field-level problems, present only for `validation_error`. */
  readonly details: ApiErrorDetail[];
  /** What actually happened, for a developer. Never rendered. */
  readonly detail: string | undefined;

  constructor(
    message: string,
    code: FailureCode,
    status: number | null,
    options?: { cause?: unknown; details?: ApiErrorDetail[]; detail?: string },
  ) {
    super(message, options);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = options?.details ?? [];
    this.detail = options?.detail;

    // The one place the technical half survives. A contract drift between the studio and
    // the API is a bug someone has to fix, and the user-facing sentence above deliberately
    // says nothing that would help them find it.
    if (this.detail !== undefined) {
      console.error(`[api] ${this.detail}`, options?.cause ?? '');
    }
  }

  /** The message for `path`, e.g. `'body.email'` — for putting an error under a field. */
  detailFor(path: string): string | undefined {
    return this.details.find((detail) => detail.path === path)?.message;
  }
}

/* ==========================================================================
   Session

   The access token is held in memory only. Persisting it to localStorage would
   put a bearer credential somewhere any script on the page can read, and it is
   unnecessary: the refresh cookie is httpOnly and survives a reload, so a page
   load restores the session by asking for a new access token (D9).
   ========================================================================== */

let accessToken: string | null = null;
let sessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Registers what to do when the refresh cookie turns out to be gone or rejected —
 * in practice, clearing the user so the router falls through to sign-in. Returns an
 * unsubscribe so a remount cannot leave a stale closure installed.
 */
export function onSessionLost(handler: () => void): () => void {
  sessionLost = handler;
  return () => {
    if (sessionLost === handler) sessionLost = null;
  };
}

/** In flight refreshes are shared, so a burst of 401s triggers one rotation, not five. */
let refreshInFlight: Promise<AuthResponse | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Resolves to `null` when there is
 * no usable session, which is an answer rather than an error: it is the expected result
 * on a first visit.
 *
 * The response carries the user as well as the token, so restoring a session on page
 * load is this one request — no follow-up `/me`.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });

      if (!response.ok) return null;

      const parsed = AuthResponse.safeParse(await response.json());
      if (!parsed.success) return null;

      setAccessToken(parsed.data.accessToken);
      return parsed.data;
    } catch {
      // Unreachable server: treat as no session rather than crashing the boot.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/* ==========================================================================
   Requests
   ========================================================================== */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /**
   * Sends no bearer token and does not retry on 401. Used by the auth routes
   * themselves, where a 401 is the answer rather than a stale-token problem.
   */
  anonymous?: boolean;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };

  // `FormData` is passed through untouched, and deliberately carries no content-type:
  // the browser has to set it, because only the browser knows the multipart boundary it
  // is about to generate. Setting one by hand produces a body no server can parse.
  const isForm = options.body instanceof FormData;

  if (options.body !== undefined && !isForm) {
    headers['content-type'] = 'application/json';
  }
  if (!options.anonymous && accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  try {
    return await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined
        ? {}
        : { body: isForm ? (options.body as FormData) : JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    // An aborted request is the caller's own doing — let it propagate as an abort so
    // TanStack Query drops it silently instead of rendering "could not reach the API".
    if (options.signal?.aborted) throw cause;

    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      'network_error',
      null,
      { cause, detail: `fetch failed for ${options.method ?? 'GET'} ${path}` },
    );
  }
}

/**
 * What to say when the API answered but not in the envelope this client understands.
 *
 * There is no message to relay in that case, so the status is all there is to go on — and
 * it is worth more than it looks. A 429 that lost its body is still "you are going too
 * fast", and saying so beats a generic apology that leaves someone retrying immediately.
 * Anything genuinely unknown gets the neutral sentence rather than the status code, which
 * would only be a number for the user to wonder about.
 */
function unexpectedResponseMessage(status: number): string {
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 401 || status === 403) return 'You are not allowed to do that.';
  if (status === 404) return 'That could not be found.';
  if (status === 413) return 'That is too large to upload.';
  if (status >= 500) return 'The server had a problem. Please try again in a moment.';
  return 'Something went wrong. Please try again.';
}

/** Turns a non-2xx response into an ApiError, falling back when the body is not ours. */
async function toError(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new ApiError(
      unexpectedResponseMessage(response.status),
      'contract_error',
      response.status,
      {
        detail: `${response.status} response body was not JSON`,
      },
    );
  }

  const parsed = ApiErrorResponse.safeParse(payload);
  if (!parsed.success) {
    return new ApiError(
      unexpectedResponseMessage(response.status),
      'contract_error',
      response.status,
      {
        cause: parsed.error,
        detail: `${response.status} response did not match the error envelope`,
      },
    );
  }

  const { code, message, details } = parsed.data.error;
  return new ApiError(message, code, response.status, { details: details ?? [] });
}

/**
 * Performs a request, transparently rotating an expired access token once. The retry is
 * deliberately single-shot: if a fresh token is also rejected, the problem is the
 * session, not the timing, and looping would only delay saying so.
 */
async function sendAuthenticated(path: string, options: RequestOptions): Promise<Response> {
  const response = await send(path, options);

  if (response.status !== 401 || options.anonymous) {
    return response;
  }

  const renewed = await refreshSession();
  if (!renewed) {
    setAccessToken(null);
    sessionLost?.();
    return response;
  }

  return send(path, options);
}

/**
 * Requests JSON and validates it against the same schema the API typed its response
 * from — so a drift between the two surfaces here, at the boundary, rather than as an
 * undefined three components deep.
 */
export async function apiRequest<T>(
  schema: ZodType<T>,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await sendAuthenticated(path, options);

  if (!response.ok) {
    throw await toError(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiError(
      unexpectedResponseMessage(response.status),
      'contract_error',
      response.status,
      {
        cause,
        detail: `${path} returned a body that is not JSON`,
      },
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      unexpectedResponseMessage(response.status),
      'contract_error',
      response.status,
      {
        cause: parsed.error,
        detail: `${path} returned a payload that does not match the contract`,
      },
    );
  }

  return parsed.data;
}

/** For the 204 routes — logout, delete — where a body would be the surprise. */
export async function apiRequestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await sendAuthenticated(path, options);

  if (!response.ok) {
    throw await toError(response);
  }
}
