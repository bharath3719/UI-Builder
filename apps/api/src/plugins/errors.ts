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
 * What to say about a failure Fastify itself raised, in the studio's voice.
 *
 * These used to be passed through verbatim on the grounds that they are written for API
 * clients — which is true, and is the problem: the studio puts `message` straight in front
 * of a person, so a mistyped request surfaced as "Body is not valid JSON but content-type
 * is set to 'application/json'" on the sign-in form. Framework text names the framework's
 * concepts, and nobody using a UI builder has a content-type.
 *
 * Keyed on `error.code`, which is the part of a Fastify error that is stable — the messages
 * are free to be reworded between releases and the codes are not. Anything unrecognised
 * falls back to the status, so a 4xx this does not know about still says something true.
 */
const FRAMEWORK_MESSAGES: Record<string, string> = {
  FST_ERR_CTP_INVALID_JSON_BODY: 'That request could not be read. Please try again.',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'That request arrived empty. Please try again.',
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: 'That request arrived incomplete. Please try again.',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'That kind of content cannot be uploaded here.',
  FST_ERR_CTP_BODY_TOO_LARGE: 'That is too large to upload.',
  FST_REQ_FILE_TOO_LARGE: 'That file is too large to upload.',
};

/** The generic answer when the code is unknown — by status, never the raw message. */
function messageForStatus(statusCode: number): string {
  if (statusCode === 404) return 'That could not be found.';
  if (statusCode === 413) return 'That is too large to upload.';
  if (statusCode === 415) return 'That kind of content cannot be uploaded here.';
  return 'That request could not be read. Please try again.';
}

function frameworkMessage(error: unknown, statusCode: number): string {
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code in FRAMEWORK_MESSAGES) {
    return FRAMEWORK_MESSAGES[code] as string;
  }
  return messageForStatus(statusCode);
}

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
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    return new AppError(
      statusCode === 404 ? 'not_found' : 'validation_error',
      statusCode,
      frameworkMessage(error, statusCode),
    );
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
        // `raw` is what the client no longer sees. A 4xx whose wording was replaced above
        // is still worth being able to read when someone asks why a request was refused.
        request.log.debug(
          {
            code: appError.code,
            details: appError.details,
            ...(error instanceof Error && error.message !== appError.message
              ? { raw: error.message }
              : {}),
          },
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
