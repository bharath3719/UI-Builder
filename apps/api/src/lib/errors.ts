import type { ApiErrorCode, ApiErrorDetail } from '@ui-builder/schema';

/**
 * A failure the client is allowed to see. Anything thrown that is *not* an AppError is
 * treated as a bug: logged in full and reported as a generic `internal_error`, so an
 * accidental `undefined.foo` can never leak a stack trace or a query into a response.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details: ApiErrorDetail[] | undefined;

  constructor(
    code: ApiErrorCode,
    statusCode: number,
    message: string,
    options?: { details?: ApiErrorDetail[]; cause?: unknown },
  ) {
    super(message, options?.cause == null ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = options?.details;
  }
}

export class ValidationError extends AppError {
  constructor(details: ApiErrorDetail[], message = 'The request is invalid.') {
    super('validation_error', 400, message, { details });
  }
}

/** No usable credentials — missing, malformed, expired, or simply wrong. */
export class UnauthorizedError extends AppError {
  constructor(message = 'You are not signed in.') {
    super('unauthorized', 401, message);
  }
}

/** Signed in, but not permitted. Signing in again will not change the answer. */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this.') {
    super('forbidden', 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'That') {
    super('not_found', 404, `${what} could not be found.`);
  }
}

/** Uniqueness clash or a failed optimistic-lock check. */
export class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', 409, message);
  }
}
