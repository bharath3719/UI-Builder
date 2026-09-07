import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  type DocumentResponse,
  Id,
  REQUIRES,
  type RestoreRevisionResponse,
  type RevisionDetail,
  type RevisionSummary,
  SaveDocumentRequest,
  type SaveDocumentResponse,
} from '@ui-builder/schema';
import { requireProjectAccess } from '../../lib/access.js';
import { parseBody, parseParams, parseQuery } from '../../lib/validate.js';
import { getCurrentUser } from '../../plugins/auth.js';
import * as documents from './service.js';

const ProjectParams = z.object({ projectId: Id });
const RevisionParams = z.object({ projectId: Id, revisionId: Id });

/** The history panel shows a scrollable list, not an archive. */
const ListRevisionsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * The document lives under its project rather than at its own top-level resource: it has
 * no identity apart from the project, and every access decision about it is the
 * project's.
 *
 * Reading needs only VIEWER — a viewer opens the studio read-only. Writing, including
 * restoring, needs EDITOR, the same as renaming the project.
 */
const documentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/projects/:projectId/document', async (request, reply) => {
    const { projectId } = parseParams(ProjectParams, request);
    const access = await requireProjectAccess(
      app.db,
      getCurrentUser(request).id,
      projectId,
      REQUIRES.workspaceRead,
    );

    const body: DocumentResponse = await documents.getDocument(app.db, access);

    return reply.send(body);
  });

  app.put('/projects/:projectId/document', async (request, reply) => {
    const { projectId } = parseParams(ProjectParams, request);
    const input = parseBody(SaveDocumentRequest, request);
    const user = getCurrentUser(request);
    const access = await requireProjectAccess(app.db, user.id, projectId, REQUIRES.projectWrite);

    const body: SaveDocumentResponse = await documents.saveDocument(app.db, access, user.id, input);

    return reply.send(body);
  });

  app.get('/projects/:projectId/revisions', async (request, reply) => {
    const { projectId } = parseParams(ProjectParams, request);
    const { limit } = parseQuery(ListRevisionsQuery, request);
    const access = await requireProjectAccess(
      app.db,
      getCurrentUser(request).id,
      projectId,
      REQUIRES.workspaceRead,
    );

    const body: RevisionSummary[] = await documents.listRevisions(app.db, access, { limit });

    return reply.send(body);
  });

  app.get('/projects/:projectId/revisions/:revisionId', async (request, reply) => {
    const { projectId, revisionId } = parseParams(RevisionParams, request);
    const access = await requireProjectAccess(
      app.db,
      getCurrentUser(request).id,
      projectId,
      REQUIRES.workspaceRead,
    );

    const body: RevisionDetail = await documents.getRevision(app.db, access, revisionId);

    return reply.send(body);
  });

  app.post('/projects/:projectId/revisions/:revisionId/restore', async (request, reply) => {
    const { projectId, revisionId } = parseParams(RevisionParams, request);
    const user = getCurrentUser(request);
    const access = await requireProjectAccess(app.db, user.id, projectId, REQUIRES.projectWrite);

    const body: RestoreRevisionResponse = await documents.restoreRevision(
      app.db,
      access,
      user.id,
      revisionId,
    );

    return reply.send(body);
  });
};

export default documentRoutes;
