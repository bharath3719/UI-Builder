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

/** A failure that has already been turned into something worth showing a user. */
export class ApiError extends Error {
  readonly status: number | null;
  readonly code: FailureCode;
  /** Field-level problems, present only for `validation_error`. */
  readonly details: ApiErrorDetail[];

  constructor(
    message: string,
    code: FailureCode,
    status: number | null,
    options?: { cause?: unknown; details?: ApiErrorDetail[] },
  ) {
    super(message, options);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = options?.details ?? [];
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

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (!options.anonymous && accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  try {
    return await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    // An aborted request is the caller's own doing — let it propagate as an abort so
    // TanStack Query drops it silently instead of rendering "could not reach the API".
    if (options.signal?.aborted) throw cause;

    throw new ApiError('Could not reach the API server.', 'network_error', null, { cause });
  }
}

/** Turns a non-2xx response into an ApiError, falling back when the body is not ours. */
async function toError(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new ApiError(
      `The API responded ${response.status} with a non-JSON body.`,
      'contract_error',
      response.status,
    );
  }

  const parsed = ApiErrorResponse.safeParse(payload);
  if (!parsed.success) {
    return new ApiError(
      `The API responded ${response.status} in an unrecognised shape.`,
      'contract_error',
      response.status,
      { cause: parsed.error },
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
      'The API returned a body that is not JSON.',
      'contract_error',
      response.status,
      { cause },
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      'The API returned a payload that does not match the contract.',
      'contract_error',
      response.status,
      { cause: parsed.error },
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
