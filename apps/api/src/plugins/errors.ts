import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import type { ApiErrorResponse } from '@ui-builder/schema';
import { Prisma } from '../generated/prisma/client.js';
import { AppError, ValidationError } from '../lib/errors.js';

/** Unique constraint violated — two requests raced past a service-level check. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';
/** `update`/`delete` matched no row. */
const PRISMA_RECORD_NOT_FOUND = 'P2025';

/**
 * Normalises anything thrown in a route into an {@link AppError}. Only failures we
 * recognise keep their meaning; the rest become a generic 500 so an unexpected error
 * cannot describe the database or the code that produced it to a client.
 */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ValidationError(
      error.issues.map((issue) => ({
        path: issue.path.map(String).join('.') || '(root)',
        message: issue.message,
      })),
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === PRISMA_UNIQUE_VIOLATION) {
      // Services check uniqueness up front and raise a specific message; reaching here
      // means two requests raced, so the useful advice is simply "try again".
      return new AppError('conflict', 409, 'That name is already taken. Try another.');
    }
    if (error.code === PRISMA_RECORD_NOT_FOUND) {
      return new AppError('not_found', 404, 'That could not be found.');
    }
  }

  // Fastify's own 4xx errors — malformed JSON, wrong content-type, body too large.
  // Their messages are written for API clients and are safe to pass through.
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    const message = error instanceof Error ? error.message : 'The request is invalid.';
    return new AppError(statusCode === 404 ? 'not_found' : 'validation_error', statusCode, message);
  }

  return new AppError('internal_error', 500, 'Something went wrong on our end.', { cause: error });
}

/**
 * The single exit for every failed request. Registering it here rather than per-route
 * is what makes the error envelope a guarantee instead of a convention.
 */
export default fp(
  async (app) => {
    app.setErrorHandler((error, request, reply) => {
      const appError = toAppError(error);

      if (appError.statusCode >= 500) {
        // The original error, not the sanitised one — this is the only place it survives.
        request.log.error({ err: error }, `Unhandled error on ${request.method} ${request.url}`);
      } else {
        request.log.debug(
          { code: appError.code, details: appError.details },
          `${appError.statusCode} on ${request.method} ${request.url}: ${appError.message}`,
        );
      }

      const body: ApiErrorResponse = {
        error: {
          code: appError.code,
          message: appError.message,
          ...(appError.details ? { details: appError.details } : {}),
        },
      };

      return reply.status(appError.statusCode).send(body);
    });

    app.setNotFoundHandler((request, reply) => {
      const body: ApiErrorResponse = {
        error: {
          code: 'not_found',
          message: `No route for ${request.method} ${request.url}.`,
        },
      };
      return reply.status(404).send(body);
    });
  },
  { name: 'errors' },
);
