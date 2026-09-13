import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ASSET_MAX_BYTES, Id, REQUIRES, type AssetSummary } from '@ui-builder/schema';
import { requireProjectAccess } from '../../lib/access.js';
import { ValidationError } from '../../lib/errors.js';
import { parseParams } from '../../lib/validate.js';
import { getCurrentUser } from '../../plugins/auth.js';
import * as assets from './service.js';

const ProjectParams = z.object({ projectId: Id });
const AssetParams = z.object({ projectId: Id, assetId: Id });

/**
 * Uploaded files for a project — PLAN.md §12.
 *
 * Listing is VIEWER, for the reason the export route is: anyone who can open the studio
 * can already see every image in the design. Adding and removing are EDITOR, because both
 * change what the project contains.
 *
 * The upload is `multipart/form-data` rather than a JSON body with base64 in it. Base64 is
 * a third larger, has to be held in memory twice over, and would make the size limit mean
 * something different from what the user sees on their disk.
 */
const assetRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/projects/:projectId/assets', async (request, reply) => {
    const { projectId } = parseParams(ProjectParams, request);
    const access = await requireProjectAccess(
      app.db,
      getCurrentUser(request).id,
      projectId,
      REQUIRES.workspaceRead,
    );

    const body: AssetSummary[] = await assets.listAssets(app.db, access);

    return reply.send(body);
  });

  app.post('/projects/:projectId/assets', async (request, reply) => {
    const { projectId } = parseParams(ProjectParams, request);
    const access = await requireProjectAccess(
      app.db,
      getCurrentUser(request).id,
      projectId,
      REQUIRES.projectWrite,
    );

    const file = await request.file({ limits: { fileSize: ASSET_MAX_BYTES } });
    if (!file) {
      throw new ValidationError([{ path: 'file', message: 'is required' }]);
    }

    // `toBuffer` is what enforces the limit: the plugin truncates past `fileSize` and sets
    // `truncated`, so reading the whole part and then asking is the only way to tell a
    // file that fits from one that was cut off. The service checks the size again on the
    // bytes it actually has, which is what catches a limit changed in one place only.
    const bytes = await file.toBuffer();
    if (file.file.truncated) {
      throw new ValidationError([
        {
          path: 'file',
          message: `is larger than ${Math.floor(ASSET_MAX_BYTES / 1024 / 1024)} MB`,
        },
      ]);
    }

    const body: AssetSummary = await assets.uploadAsset(app.db, app.storage, access, bytes);

    return reply.status(201).send(body);
  });

  app.delete('/projects/:projectId/assets/:assetId', async (request, reply) => {
    const { projectId, assetId } = parseParams(AssetParams, request);
    const access = await requireProjectAccess(
      app.db,
      getCurrentUser(request).id,
      projectId,
      REQUIRES.projectWrite,
    );

    await assets.deleteAsset(app.db, app.storage, access, assetId);

    return reply.status(204).send();
  });
};

export default assetRoutes;
