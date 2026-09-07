import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  Id,
  REQUIRES,
  SLUG_PATTERN,
  type PublishStateResponse,
  type PublishSummary,
  type PublishedPageResponse,
} from '@ui-builder/schema';
import { requireProjectAccess } from '../../lib/access.js';
import { parseParams } from '../../lib/validate.js';
import { getCurrentUser } from '../../plugins/auth.js';
import * as publish from './service.js';

const ProjectParams = z.object({ projectId: Id });

/**
 * Validated rather than passed through: the slug reaches a database lookup, and a bounded
 * pattern means a hand-typed link fails at the boundary with a 400 instead of turning into
 * a query for an eighty-kilobyte string.
 */
const SlugParams = z.object({ slug: z.string().min(2).max(64).regex(SLUG_PATTERN) });

/**
 * Publishing and the public read (PLAN.md §12, Phase 9).
 *
 * The two live in one module because they are two halves of one feature, and in two
 * Fastify scopes because only one of them may require a session. `/published/:slug` is
 * registered on the outer scope, deliberately before the encapsulated child that adds
 * `requireAuth` — a hook added inside a child plugin cannot reach back out, which is what
 * makes "public" a structural fact here rather than a convention someone has to remember.
 */
const publishRoutes: FastifyPluginAsync = async (app) => {
  /* Public. The slug is the only credential; see the service for why it carries a token. */
  app.get('/published/:slug', async (request, reply) => {
    const { slug } = parseParams(SlugParams, request);

    const body: PublishedPageResponse = await publish.getPublishedPage(app.db, slug);

    // A published page is a snapshot, but the row behind the slug can move (republish) or
    // vanish (unpublish), so it must not be cached as though it were immutable.
    return reply.header('cache-control', 'no-store').send(body);
  });

  await app.register(async (secured) => {
    secured.addHook('preHandler', app.requireAuth);

    // Reading the publish state needs only VIEWER — a viewer may open the share dialog and
    // copy an existing link. Creating or removing one is an EDITOR action, the same as
    // every other change to what the project shows the world.
    secured.get('/projects/:projectId/publish', async (request, reply) => {
      const { projectId } = parseParams(ProjectParams, request);
      const access = await requireProjectAccess(
        app.db,
        getCurrentUser(request).id,
        projectId,
        REQUIRES.workspaceRead,
      );

      const body: PublishStateResponse = await publish.getPublishState(app.db, access);

      return reply.send(body);
    });

    secured.post('/projects/:projectId/publish', async (request, reply) => {
      const { projectId } = parseParams(ProjectParams, request);
      const access = await requireProjectAccess(
        app.db,
        getCurrentUser(request).id,
        projectId,
        REQUIRES.projectWrite,
      );

      const body: PublishSummary = await publish.publishProject(app.db, access);

      return reply.send(body);
    });

    secured.delete('/projects/:projectId/publish', async (request, reply) => {
      const { projectId } = parseParams(ProjectParams, request);
      const access = await requireProjectAccess(
        app.db,
        getCurrentUser(request).id,
        projectId,
        REQUIRES.projectWrite,
      );

      await publish.unpublishProject(app.db, access);

      return reply.status(204).send();
    });
  });
};

export default publishRoutes;
