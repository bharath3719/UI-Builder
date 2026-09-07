import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  AddMemberRequest,
  CreateWorkspaceRequest,
  Id,
  REQUIRES,
  UpdateMemberRequest,
  UpdateWorkspaceRequest,
  type WorkspaceMemberSummary,
  type WorkspaceSummary,
} from '@ui-builder/schema';
import { requireWorkspaceAccess } from '../../lib/access.js';
import { parseBody, parseParams } from '../../lib/validate.js';
import { getCurrentUser } from '../../plugins/auth.js';
import * as workspaces from './service.js';

const WorkspaceParams = z.object({ workspaceId: Id });
const MemberParams = z.object({ workspaceId: Id, memberId: Id });

const workspaceRoutes: FastifyPluginAsync = async (app) => {
  // Every route here needs a signed-in user; the role check is per-route below.
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (request, reply) => {
    const body: WorkspaceSummary[] = await workspaces.listWorkspaces(
      app.db,
      getCurrentUser(request).id,
    );

    return reply.send(body);
  });

  /** No role check: any signed-in user may start a workspace of their own. */
  app.post('/', async (request, reply) => {
    const input = parseBody(CreateWorkspaceRequest, request);
    const body: WorkspaceSummary = await workspaces.createWorkspace(
      app.db,
      getCurrentUser(request).id,
      input,
    );

    return reply.status(201).send(body);
  });

  app.get('/:workspaceId', async (request, reply) => {
    const { workspaceId } = parseParams(WorkspaceParams, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.workspaceRead,
    );

    const body: WorkspaceSummary = await workspaces.getWorkspace(app.db, access);

    return reply.send(body);
  });

  app.patch('/:workspaceId', async (request, reply) => {
    const { workspaceId } = parseParams(WorkspaceParams, request);
    const input = parseBody(UpdateWorkspaceRequest, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.workspaceManage,
    );

    const body: WorkspaceSummary = await workspaces.updateWorkspace(app.db, access, input);

    return reply.send(body);
  });

  app.delete('/:workspaceId', async (request, reply) => {
    const { workspaceId } = parseParams(WorkspaceParams, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.workspaceDelete,
    );

    await workspaces.deleteWorkspace(app.db, access);

    return reply.status(204).send();
  });

  app.get('/:workspaceId/members', async (request, reply) => {
    const { workspaceId } = parseParams(WorkspaceParams, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.workspaceRead,
    );

    const body: WorkspaceMemberSummary[] = await workspaces.listMembers(app.db, access);

    return reply.send(body);
  });

  app.post('/:workspaceId/members', async (request, reply) => {
    const { workspaceId } = parseParams(WorkspaceParams, request);
    const input = parseBody(AddMemberRequest, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.workspaceManage,
    );

    const body: WorkspaceMemberSummary = await workspaces.addMember(app.db, access, input);

    return reply.status(201).send(body);
  });

  app.patch('/:workspaceId/members/:memberId', async (request, reply) => {
    const { workspaceId, memberId } = parseParams(MemberParams, request);
    const input = parseBody(UpdateMemberRequest, request);
    const user = getCurrentUser(request);
    const access = await requireWorkspaceAccess(
      app.db,
      user.id,
      workspaceId,
      REQUIRES.workspaceManage,
    );

    const body: WorkspaceMemberSummary = await workspaces.updateMemberRole(
      app.db,
      access,
      user.id,
      memberId,
      input.role,
    );

    return reply.send(body);
  });

  /**
   * Guarded at viewer level on purpose: this is both "remove a member" and "leave the
   * workspace", and a viewer must be able to do the second. The service applies the
   * real rule — you may act on yourself, or on someone you outrank.
   */
  app.delete('/:workspaceId/members/:memberId', async (request, reply) => {
    const { workspaceId, memberId } = parseParams(MemberParams, request);
    const user = getCurrentUser(request);
    const access = await requireWorkspaceAccess(
      app.db,
      user.id,
      workspaceId,
      REQUIRES.workspaceRead,
    );

    await workspaces.removeMember(app.db, access, user.id, memberId);

    return reply.status(204).send();
  });
};

export default workspaceRoutes;
