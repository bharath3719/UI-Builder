import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { ASSET_MAX_BYTES } from '@ui-builder/schema';
import { env, isProduction } from './env.js';
import assetRoutes from './modules/assets/routes.js';
import authRoutes from './modules/auth/routes.js';
import documentRoutes from './modules/documents/routes.js';
import exportRoutes from './modules/export/routes.js';
import healthRoutes from './modules/health/routes.js';
import integrationRoutes from './modules/integrations/routes.js';
import projectRoutes from './modules/projects/routes.js';
import publishRoutes from './modules/publish/routes.js';
import workspaceRoutes from './modules/workspaces/routes.js';
import authPlugin from './plugins/auth.js';
import errorsPlugin from './plugins/errors.js';
import prismaPlugin from './plugins/prisma.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import storagePlugin from './plugins/storage.js';

/**
 * Builds the server without listening, so integration tests can drive it via
 * `app.inject()` and `server.ts` stays a thin entry point.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    /*
     * Every request in production arrives through Caddy (deploy/Caddyfile), so the socket's
     * peer is the docker bridge and `X-Forwarded-For` is the only thing that knows who
     * actually called. Without this the whole internet shares one address: the log
     * attributes every request to 172.x, and the rate limiter below puts every caller in
     * one bucket, where the first attacker locks out every real user.
     *
     * Safe because nothing reaches this port except the proxy — compose publishes 80 and
     * 443 on `web` and no port at all on `api`, so a client cannot forge the header without
     * already being inside the compose network.
     */
    trustProxy: true,
    logger: {
      level: env.LOG_LEVEL,
      ...(isProduction
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname,reqId',
              },
            },
          }),
    },
    // Fastify's default request logging is twelve lines per request, which buries
    // everything else. One compact line per response instead (see the onResponse
    // hook below). The top-level `disableRequestLogging` is deprecated in Fastify 5
    // and removed in 6, so this goes through logController.
    logController: new LogController({ disableRequestLogging: true }),
  });

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      `${request.method} ${request.url} → ${reply.statusCode} (${Math.round(reply.elapsedTime)}ms)`,
    );
    done();
  });

  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  // One file per request and a hard ceiling on it, so a multi-gigabyte body is refused by
  // the parser rather than read into memory and then rejected by the asset service.
  await app.register(multipart, {
    limits: { fileSize: ASSET_MAX_BYTES, files: 1, fields: 4 },
  });
  await app.register(errorsPlugin);
  // Before the routes, so the per-route limits in `auth/routes.ts` have something to
  // configure — and after `errorsPlugin`, so a 429 uses the same envelope as every other
  // refusal.
  await app.register(rateLimitPlugin);
  await app.register(prismaPlugin);
  await app.register(storagePlugin);
  await app.register(authPlugin);

  await app.register(healthRoutes);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(workspaceRoutes, { prefix: '/api/workspaces' });
  // API integrations hang off a workspace, so they share its prefix — but they are their
  // own module: an outbound HTTP client and a credential store are not workspace concerns.
  await app.register(integrationRoutes, { prefix: '/api/workspaces' });
  // Project routes carry their own paths: some hang off a workspace, some off a
  // project id, so a single prefix would fit only half of them.
  await app.register(projectRoutes, { prefix: '/api' });
  // Same reasoning: a document and its revisions hang off a project id.
  await app.register(documentRoutes, { prefix: '/api' });
  // Publishing hangs off a project id; the shared link it produces is public and hangs off
  // nothing but its slug. Both are in the one plugin — see the note there about scopes.
  await app.register(publishRoutes, { prefix: '/api' });
  // The export hangs off a project id too, and answers with a zip rather than JSON.
  await app.register(exportRoutes, { prefix: '/api' });
  // Assets hang off a project id, and the upload arrives as multipart rather than JSON.
  await app.register(assetRoutes, { prefix: '/api' });

  return app;
}
