import {
  outranks,
  type AddMemberRequest,
  type CreateWorkspaceRequest,
  type Role,
  type UpdateWorkspaceRequest,
  type WorkspaceMemberSummary,
  type WorkspaceSummary,
} from '@ui-builder/schema';
import type { Db } from '../../db/client.js';
import type { WorkspaceAccess } from '../../lib/access.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { resolveUniqueSlug } from '../../lib/slug.js';

/** Shape of the membership row joined onto member listings. */
type MemberWithUser = {
  id: string;
  userId: string;
  role: Role;
  createdAt: Date;
  user: { email: string; name: string };
};

function toMemberSummary(member: MemberWithUser): WorkspaceMemberSummary {
  return {
    id: member.id,
    userId: member.userId,
    email: member.user.email,
    name: member.user.name,
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  };
}

/** Archived projects are excluded — this number drives the "N projects" label in the switcher. */
const activeProjectCount = { select: { projects: { where: { archivedAt: null } } } } as const;

function toWorkspaceSummary(
  workspace: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    _count: { projects: number };
  },
  role: Role,
): WorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
    projectCount: workspace._count.projects,
    createdAt: workspace.createdAt.toISOString(),
  };
}

async function isSlugTaken(db: Db, slug: string, exceptId?: string): Promise<boolean> {
  const existing = await db.workspace.findUnique({ where: { slug }, select: { id: true } });
  return existing != null && existing.id !== exceptId;
}

/** Every workspace the user belongs to, newest first. */
export async function listWorkspaces(db: Db, userId: string): Promise<WorkspaceSummary[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    include: { workspace: { include: { _count: activeProjectCount } } },
    orderBy: { workspace: { createdAt: 'desc' } },
  });

  return memberships.map((membership) => toWorkspaceSummary(membership.workspace, membership.role));
}

/** The creator becomes its OWNER; a workspace is never left without one. */
export async function createWorkspace(
  db: Db,
  userId: string,
  input: CreateWorkspaceRequest,
): Promise<WorkspaceSummary> {
  const slug = input.slug
    ? input.slug
    : await resolveUniqueSlug(input.name, (candidate) => isSlugTaken(db, candidate));

  // An explicit slug is the user's choice, so a clash is worth reporting precisely
  // rather than silently renaming to `-2`.
  if (input.slug && (await isSlugTaken(db, input.slug))) {
    throw new ConflictError(`The address "${input.slug}" is already in use.`);
  }

  const workspace = await db.workspace.create({
    data: {
      name: input.name,
      slug,
      // Nested create: the workspace and its first membership commit together, so a
      // failure cannot leave an orphaned workspace nobody can reach.
      members: { create: { userId, role: 'OWNER' } },
    },
    include: { _count: activeProjectCount },
  });

  return toWorkspaceSummary(workspace, 'OWNER');
}

export async function getWorkspace(db: Db, access: WorkspaceAccess): Promise<WorkspaceSummary> {
  const workspace = await db.workspace.findUnique({
    where: { id: access.workspaceId },
    include: { _count: activeProjectCount },
  });

  if (!workspace) {
    throw new NotFoundError('That workspace');
  }

  return toWorkspaceSummary(workspace, access.role);
}

export async function updateWorkspace(
  db: Db,
  access: WorkspaceAccess,
  input: UpdateWorkspaceRequest,
): Promise<WorkspaceSummary> {
  if (input.slug && (await isSlugTaken(db, input.slug, access.workspaceId))) {
    throw new ConflictError(`The address "${input.slug}" is already in use.`);
  }

  const workspace = await db.workspace.update({
    where: { id: access.workspaceId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.slug === undefined ? {} : { slug: input.slug }),
    },
    include: { _count: activeProjectCount },
  });

  return toWorkspaceSummary(workspace, access.role);
}

/** Cascades to members, projects and their revisions (see the Prisma relations). */
export async function deleteWorkspace(db: Db, access: WorkspaceAccess): Promise<void> {
  await db.workspace.delete({ where: { id: access.workspaceId } });
}

export async function listMembers(
  db: Db,
  access: WorkspaceAccess,
): Promise<WorkspaceMemberSummary[]> {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: access.workspaceId },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return members.map(toMemberSummary);
}

/**
 * Adds an existing account to the workspace. Phase 1 has no email delivery, so there is
 * nothing to send an invitation to — the person must already have registered.
 */
export async function addMember(
  db: Db,
  access: WorkspaceAccess,
  input: AddMemberRequest,
): Promise<WorkspaceMemberSummary> {
  // You cannot hand out authority you do not have: an ADMIN inviting an OWNER would be
  // a one-step privilege escalation.
  if (!outranks(access.role, input.role) && access.role !== input.role) {
    throw new ForbiddenError(`You cannot grant the ${input.role.toLowerCase()} role.`);
  }

  const user = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (!user) {
    throw new NotFoundError(`No account for ${input.email}`);
  }

  const existing = await db.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: access.workspaceId } },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(`${input.email} is already a member of this workspace.`);
  }

  const member = await db.workspaceMember.create({
    data: { userId: user.id, workspaceId: access.workspaceId, role: input.role },
    include: { user: { select: { email: true, name: true } } },
  });

  return toMemberSummary(member);
}

/** Loads a member and confirms it belongs to the workspace the caller has access to. */
async function findMemberInWorkspace(db: Db, access: WorkspaceAccess, memberId: string) {
  const member = await db.workspaceMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { email: true, name: true } } },
  });

  // The workspace check matters: without it, a member id from another workspace would
  // be actioned by anyone holding admin rights anywhere.
  if (!member || member.workspaceId !== access.workspaceId) {
    throw new NotFoundError('That member');
  }

  return member;
}

async function countOwners(db: Db, workspaceId: string): Promise<number> {
  return db.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } });
}

export async function updateMemberRole(
  db: Db,
  access: WorkspaceAccess,
  actorUserId: string,
  memberId: string,
  role: Role,
): Promise<WorkspaceMemberSummary> {
  const member = await findMemberInWorkspace(db, access, memberId);

  // Changing your own role is the fast route to locking yourself — or the whole
  // workspace — out. To hand over ownership, promote someone else and then leave.
  if (member.userId === actorUserId) {
    throw new ForbiddenError('You cannot change your own role.');
  }

  if (!outranks(access.role, member.role)) {
    throw new ForbiddenError(
      `You cannot change the role of a workspace ${member.role.toLowerCase()}.`,
    );
  }

  if (!outranks(access.role, role) && access.role !== role) {
    throw new ForbiddenError(`You cannot grant the ${role.toLowerCase()} role.`);
  }

  const updated = await db.workspaceMember.update({
    where: { id: memberId },
    data: { role },
    include: { user: { select: { email: true, name: true } } },
  });

  return toMemberSummary(updated);
}

export async function removeMember(
  db: Db,
  access: WorkspaceAccess,
  actorUserId: string,
  memberId: string,
): Promise<void> {
  const member = await findMemberInWorkspace(db, access, memberId);
  const isSelf = member.userId === actorUserId;

  // Anyone may leave of their own accord; removing someone else needs rank over them.
  if (!isSelf && !outranks(access.role, member.role)) {
    throw new ForbiddenError(`You cannot remove a workspace ${member.role.toLowerCase()}.`);
  }

  if (member.role === 'OWNER' && (await countOwners(db, access.workspaceId)) === 1) {
    throw new ConflictError(
      'This is the only owner. Promote another member to owner before removing this one.',
    );
  }

  await db.workspaceMember.delete({ where: { id: memberId } });
}
