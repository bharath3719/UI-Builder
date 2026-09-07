import { z } from 'zod';

/**
 * Every non-2xx response from the API has this body. One shape means the studio has
 * exactly one place to decide how a failure is shown, and `code` is a closed union
 * so that decision can be a switch rather than string-matching messages.
 */
export const ApiErrorCode = z.enum([
  /** Request body, params or query failed validation. `details` lists the fields. */
  'validation_error',
  /** No valid credentials. The studio should send the user to sign in. */
  'unauthorized',
  /** Authenticated, but this user's role does not allow it. Signing in again won't help. */
  'forbidden',
  /** Either it does not exist or this user may not know that it does — see below. */
  'not_found',
  /** Uniqueness or optimistic-lock violation: email taken, slug taken, stale version. */
  'conflict',
  /** Unexpected. `message` is deliberately generic; the detail is in the server log. */
  'internal_error',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** One field-level problem. `path` is dotted (`'body.email'`, `'params.id'`). */
export const ApiErrorDetail = z.object({
  path: z.string(),
  message: z.string(),
});
export type ApiErrorDetail = z.infer<typeof ApiErrorDetail>;

export const ApiErrorResponse = z.object({
  error: z.object({
    code: ApiErrorCode,
    /** Safe to show a user as-is. */
    message: z.string(),
    /** Present only for `validation_error`. */
    details: z.array(ApiErrorDetail).optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponse>;
