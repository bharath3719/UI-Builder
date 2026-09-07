import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  type AuthResponse,
  type AuthUser,
  LoginRequest,
  RegisterRequest,
} from '@ui-builder/schema';
import { getCurrentUser } from '../../plugins/auth.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { parseBody } from '../../lib/validate.js';
import * as authService from './service.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE_NAME,
  clearedRefreshCookieOptions,
  refreshCookieOptions,
} from './tokens.js';

/**
 * Attaches the rotated refresh token as an httpOnly cookie and returns the body the
 * three session-establishing routes share.
 */
function completeSession(reply: FastifyReply, session: authService.Session): AuthResponse {
  reply.setCookie(REFRESH_COOKIE_NAME, session.refreshToken, refreshCookieOptions());

  return {
    user: session.user,
    accessToken: reply.server.signAccessToken({ id: session.user.id, email: session.user.email }),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const body = parseBody(RegisterRequest, request);
    const session = await authService.register(app.db, body);

    return reply.status(201).send(completeSession(reply, session));
  });

  app.post('/login', async (request, reply) => {
    const body = parseBody(LoginRequest, request);
    const session = await authService.login(app.db, body);

    return reply.send(completeSession(reply, session));
  });

  /**
   * Renews an expiring access token. The refresh token comes from the cookie rather
   * than the body, so the studio never has to hold it in JavaScript.
   */
  app.post('/refresh', async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedError('You are not signed in.');
    }

    const session = await authService.refresh(app.db, token);

    return reply.send(completeSession(reply, session));
  });

  /**
   * Not behind `requireAuth`: signing out has to work when the access token has already
   * expired, which is exactly when a user is most likely to be doing it.
   */
  app.post('/logout', async (request, reply) => {
    await authService.logout(app.db, request.cookies[REFRESH_COOKIE_NAME]);

    reply.clearCookie(REFRESH_COOKIE_NAME, clearedRefreshCookieOptions());

    return reply.status(204).send();
  });

  app.get('/me', { preHandler: app.requireAuth }, async (request, reply) => {
    const body: AuthUser = await authService.getUser(app.db, getCurrentUser(request).id);

    return reply.send(body);
  });
};

export default authRoutes;
