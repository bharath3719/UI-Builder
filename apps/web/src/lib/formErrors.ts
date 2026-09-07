import type { ZodError } from 'zod';
import { ApiError } from '../api/client.js';

/** Field name → message. Keys are the plain field names, without a `body.` prefix. */
export type FieldErrors = Record<string, string>;

/**
 * Flattens a zod failure to one message per field — the first, because showing three
 * complaints about the same input at once is noise, not help.
 */
export function zodFieldErrors(error: ZodError): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !(field in errors)) {
      errors[field] = issue.message;
    }
  }

  return errors;
}

/**
 * Pulls field-level messages out of a rejected request. The server reports paths as
 * `'body.email'`; forms think in terms of `'email'`, so the segment is dropped here
 * rather than at every call site.
 *
 * Returns `{}` for anything that is not a field-level failure — a 403 or a network
 * error belongs in the form-wide banner, not under an input.
 */
export function serverFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || error.code !== 'validation_error') {
    return {};
  }

  const errors: FieldErrors = {};

  for (const detail of error.details) {
    const field = detail.path.replace(/^(body|query|params)\./, '');
    if (!(field in errors)) {
      errors[field] = detail.message;
    }
  }

  return errors;
}

/**
 * The message for the form-wide banner, or `undefined` when the failure was entirely
 * field-level and is already shown under the inputs.
 */
export function formErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined;

  if (error instanceof ApiError) {
    if (error.code === 'validation_error' && error.details.length > 0) {
      return undefined;
    }
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}
