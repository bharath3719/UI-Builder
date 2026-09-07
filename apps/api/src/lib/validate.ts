import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { ApiErrorDetail } from '@ui-builder/schema';
import { ValidationError } from './errors.js';

/**
 * Where the bad value came from. It prefixes the reported path (`body.email`) so a
 * client can tell a bad field apart from a bad route parameter.
 */
type Source = 'body' | 'params' | 'query';

function toDetails(error: z.ZodError, source: Source): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    // A whole-object refinement has an empty path; report it against the source itself.
    path: [source, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}

/**
 * Parses one part of a request, throwing a `ValidationError` that the error handler
 * turns into a 400 with per-field detail.
 *
 * Returns the *parsed* value rather than the raw one, which matters: the contracts
 * trim and lowercase as they validate, so handlers get normalised data by construction.
 */
function parse<T extends z.ZodType>(schema: T, value: unknown, source: Source): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(toDetails(result.error, source));
  }
  return result.data;
}

export function parseBody<T extends z.ZodType>(schema: T, request: FastifyRequest): z.output<T> {
  return parse(schema, request.body, 'body');
}

export function parseParams<T extends z.ZodType>(schema: T, request: FastifyRequest): z.output<T> {
  return parse(schema, request.params, 'params');
}

export function parseQuery<T extends z.ZodType>(schema: T, request: FastifyRequest): z.output<T> {
  return parse(schema, request.query, 'query');
}
