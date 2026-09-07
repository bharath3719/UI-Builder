import cors from '@fastify/cors';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { env, isProduction } from './env.js';
import authRoutes from './modules/auth/routes.js';
import documentRoutes from './modules/documents/routes.js';
import exportRoutes from './modules/export/routes.js';
import healthRoutes from './modules/health/routes.js';
import projectRoutes from './modules/projects/routes.js';
import publishRoutes from './modules/publish/routes.js';
import workspaceRoutes from './modules/workspaces/routes.js';
import authPlugin from './plugins/auth.js';
import errorsPlugin from './plugins/errors.js';
import prismaPlugin from './plugins/prisma.js';

/**
 * Builds the server without listening, so integration tests can drive it via
 * `app.inject()` and `server.ts` stays a thin entry point.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
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
  await app.register(errorsPlugin);
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  await app.register(healthRoutes);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(workspaceRoutes, { prefix: '/api/workspaces' });
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

  return app;
}
