import { hasAtLeast, type Role } from '@ui-builder/schema';
import type { Db } from '../db/client.js';
import type { ProjectModel } from '../generated/prisma/models.js';
import { ForbiddenError, NotFoundError } from './errors.js';

/**
 * A caller's proven standing in a workspace. Handlers take this rather than re-reading
 * the membership, so an authorisation decision is made once per request.
 */
export interface WorkspaceAccess {
  workspaceId: string;
  role: Role;
}

export interface ProjectAccess extends WorkspaceAccess {
  project: ProjectModel;
}

/**
 * Why a non-member gets 403 and not 404:
 *
 * 404 would hide whether the workspace exists at all, which is the stricter choice. We
 * return 403 because PLAN.md §12 makes it the Phase 1 acceptance criterion, and because
 * "you are not a member of this workspace" is a far more actionable message for the
 * shared-link case than pretending the thing is missing. Ids are unguessable, so what
 * leaks is only confirmation of an id someone already has.
 *
 * Changing this is a one-line edit here, and nowhere else.
 */
export async function requireWorkspaceAccess(
  db: Db,
  userId: string,
  workspaceId: string,
  minimum: Role,
): Promise<WorkspaceAccess> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    // Filtering the join by user means one round trip and at most one member row back,
    // rather than loading a workspace's entire membership to check a single person.
    include: { members: { where: { userId } } },
  });

  if (!workspace) {
    throw new NotFoundError('That workspace');
  }

  const membership = workspace.members[0];
  if (!membership) {
    throw new ForbiddenError('You are not a member of this workspace.');
  }

  if (!hasAtLeast(membership.role, minimum)) {
    throw new ForbiddenError(
      `This action needs the ${minimum.toLowerCase()} role or higher; you have ${membership.role.toLowerCase()}.`,
    );
  }

  return { workspaceId: workspace.id, role: membership.role };
}

/** The same check, reached through a project rather than its workspace. */
export async function requireProjectAccess(
  db: Db,
  userId: string,
  projectId: string,
  minimum: Role,
): Promise<ProjectAccess> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { workspace: { include: { members: { where: { userId } } } } },
  });

  if (!project) {
    throw new NotFoundError('That project');
  }

  const membership = project.workspace.members[0];
  if (!membership) {
    throw new ForbiddenError('You are not a member of the workspace this project belongs to.');
  }

  if (!hasAtLeast(membership.role, minimum)) {
    throw new ForbiddenError(
      `This action needs the ${minimum.toLowerCase()} role or higher; you have ${membership.role.toLowerCase()}.`,
    );
  }

  const { workspace: _workspace, ...bare } = project;

  return { workspaceId: project.workspaceId, role: membership.role, project: bare };
}
