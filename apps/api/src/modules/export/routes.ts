import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Id, REQUIRES } from '@ui-builder/schema';
import { requireProjectAccess } from '../../lib/access.js';
import { parseParams } from '../../lib/validate.js';
import { getCurrentUser } from '../../plugins/auth.js';
import * as exports from './service.js';

const ProjectParams = z.object({ projectId: Id });

/**
 * Downloading a project as code (PLAN.md §12, Phase 10).
 *
 * VIEWER, not EDITOR. The export is a rendering of the document, and anyone who can open
 * the studio can already read every line of it in the code panel — gating the zip behind
 * a higher role would protect nothing and would stop a viewer from taking away the thing
 * they were shown.
 */
const exportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/projects/:projectId/export', async (request, reply) => {
    const { projectId } = parseParams(ProjectParams, request);
    const access = await requireProjectAccess(
      app.db,
      getCurrentUser(request).id,
      projectId,
      REQUIRES.workspaceRead,
    );

    const archive = await exports.exportProject(app.db, access);

    return (
      reply
        .header('content-type', 'application/zip')
        // The filename is a slug — lowercase, digits and hyphens — so it needs no quoting
        // beyond the quotes, and cannot carry a newline into the header.
        .header('content-disposition', `attachment; filename="${archive.filename}"`)
        // Regenerated from the live document on every request, so it is never the same
        // file twice in a row for a project someone is working on.
        .header('cache-control', 'no-store')
        // The download is a navigation, so nothing on the page reads the body. This is
        // how the studio can still tell the user something was left out.
        .header('x-export-warnings', String(archive.warnings.length))
        .send(Buffer.from(archive.bytes))
    );
  });
};

export default exportRoutes;
