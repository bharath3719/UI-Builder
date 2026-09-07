import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CreateProjectRequest,
  Id,
  ListProjectsQuery,
  type ProjectSummary,
  REQUIRES,
  UpdateProjectRequest,
} from '@ui-builder/schema';
import { requireProjectAccess, requireWorkspaceAccess } from '../../lib/access.js';
import { parseBody, parseParams, parseQuery } from '../../lib/validate.js';
import { getCurrentUser } from '../../plugins/auth.js';
import * as projects from './service.js';

const WorkspaceParams = z.object({ workspaceId: Id });
const ProjectParams = z.object({ projectId: Id });

/**
 * Listing and creating hang off a workspace, because that is what scopes them. Reading
 * and writing one project addresses it directly: a project id already implies its
 * workspace, and repeating it in the path would just be a second thing to keep in sync.
 */
const projectRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/workspaces/:workspaceId/projects', async (request, reply) => {
    const { workspaceId } = parseParams(WorkspaceParams, request);
    const query = parseQuery(ListProjectsQuery, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.workspaceRead,
    );

    const body: ProjectSummary[] = await projects.listProjects(app.db, access, {
      includeArchived: query.includeArchived,
    });

    return reply.send(body);
  });

  app.post('/workspaces/:workspaceId/projects', async (request, reply) => {
    const { workspaceId } = parseParams(WorkspaceParams, request);
    const input = parseBody(CreateProjectRequest, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.projectWrite,
    );

    const body: ProjectSummary = await projects.createProject(app.db, access, input);

    return reply.status(201).send(body);
  });

  app.get('/projects/:projectId', async (request, reply) => {
    const { projectId } = parseParams(ProjectParams, request);
    const access = await requireProjectAccess(
      app.db,
      getCurrentUser(request).id,
      projectId,
      REQUIRES.workspaceRead,
    );

    const body: ProjectSummary = projects.getProject(access);

    return reply.send(body);
  });

  app.patch('/projects/:projectId', async (request, reply) => {
    const { projectId } = parseParams(ProjectParams, request);
    const input = parseBody(UpdateProjectRequest, request);
    const access = await requireProjectAccess(
      app.db,
      getCurrentUser(request).id,
      projectId,
      REQUIRES.projectWrite,
    );

    const body: ProjectSummary = await projects.updateProject(app.db, access, input);

    return reply.send(body);
  });

  app.delete('/projects/:projectId', async (request, reply) => {
    const { projectId } = parseParams(ProjectParams, request);
    const access = await requireProjectAccess(
      app.db,
      getCurrentUser(request).id,
      projectId,
      REQUIRES.projectDelete,
    );

    await projects.deleteProject(app.db, access);

    return reply.status(204).send();
  });
};

export default projectRoutes;
