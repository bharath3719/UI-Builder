import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { AccessTokenClaims } from '@ui-builder/schema';
import { env } from '../env.js';
import { UnauthorizedError } from '../lib/errors.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../modules/auth/tokens.js';

/** The subset of a user that every authenticated request carries. */
export interface CurrentUser {
  id: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * preHandler that rejects the request unless it carries a valid access token.
     * Routes behind it can rely on `getCurrentUser(request)` returning a user.
     */
    requireAuth: preHandlerHookHandler;
    signAccessToken(user: CurrentUser): string;
  }

  interface FastifyRequest {
    /** Populated by {@link FastifyInstance.requireAuth}; null on unauthenticated routes. */
    currentUser: CurrentUser | null;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenClaims;
    user: AccessTokenClaims;
  }
}

/**
 * Narrows `request.currentUser` for handlers that run behind `requireAuth`.
 *
 * The decorator is typed nullable because it genuinely is null on public routes; this
 * turns "I registered the preHandler" into something the type checker enforces at the
 * point of use rather than a comment.
 */
export function getCurrentUser(request: FastifyRequest): CurrentUser {
  if (!request.currentUser) {
    throw new UnauthorizedError();
  }
  return request.currentUser;
}

export default fp(
  async (app) => {
    await app.register(cookie, { secret: env.JWT_SECRET });

    await app.register(jwt, {
      secret: env.JWT_SECRET,
      sign: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    });

    app.decorate('signAccessToken', (user: CurrentUser) =>
      app.jwt.sign({ sub: user.id, email: user.email }),
    );

    // Declared per-request so each request gets its own value rather than sharing one
    // slot on the prototype.
    app.decorateRequest('currentUser', null);

    app.decorate('requireAuth', async (request: FastifyRequest) => {
      try {
        // jwtVerify's own return type is the un-narrowed payload union; `request.user`
        // is what the FastifyJWT augmentation above types for us.
        await request.jwtVerify();
        request.currentUser = { id: request.user.sub, email: request.user.email };
      } catch (cause) {
        const code = (cause as { code?: string }).code ?? '';
        throw new UnauthorizedError(
          code.includes('EXPIRED') ? 'Your session has expired.' : 'You are not signed in.',
        );
      }
    });
  },
  { name: 'auth', dependencies: [] },
);
