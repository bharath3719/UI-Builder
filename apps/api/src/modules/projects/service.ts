import type {
  CreateProjectRequest,
  ProjectSummary,
  Role,
  UpdateProjectRequest,
} from '@ui-builder/schema';
import type { Db } from '../../db/client.js';
import type { ProjectAccess, WorkspaceAccess } from '../../lib/access.js';
import type { ProjectModel } from '../../generated/prisma/models.js';
import { ConflictError } from '../../lib/errors.js';
import { resolveUniqueSlug } from '../../lib/slug.js';

/** `role` is the caller's standing, so it comes from the access check, not the row. */
export function toProjectSummary(project: ProjectModel, role: Role): ProjectSummary {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    slug: project.slug,
    thumbnailUrl: project.thumbnailUrl,
    role,
    version: project.version,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    archivedAt: project.archivedAt?.toISOString() ?? null,
  };
}

/** Slugs are unique per workspace, not globally — two teams may both have a "landing". */
async function isSlugTaken(
  db: Db,
  workspaceId: string,
  slug: string,
  exceptId?: string,
): Promise<boolean> {
  const existing = await db.project.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: { id: true },
  });
  return existing != null && existing.id !== exceptId;
}

export async function listProjects(
  db: Db,
  access: WorkspaceAccess,
  { includeArchived }: { includeArchived: boolean },
): Promise<ProjectSummary[]> {
  const projects = await db.project.findMany({
    where: {
      workspaceId: access.workspaceId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { updatedAt: 'desc' },
  });

  return projects.map((project) => toProjectSummary(project, access.role));
}

export async function createProject(
  db: Db,
  access: WorkspaceAccess,
  input: CreateProjectRequest,
): Promise<ProjectSummary> {
  if (input.slug && (await isSlugTaken(db, access.workspaceId, input.slug))) {
    throw new ConflictError(`This workspace already has a project at "${input.slug}".`);
  }

  const slug = input.slug
    ? input.slug
    : await resolveUniqueSlug(
        input.name,
        (candidate) => isSlugTaken(db, access.workspaceId, candidate),
        { fallback: 'project' },
      );

  // `version` stays 0 and `currentRevisionId` null: there is no ProjectDoc to write
  // yet. Phase 3 defines the document, Phase 8 starts saving revisions.
  const project = await db.project.create({
    data: { workspaceId: access.workspaceId, name: input.name, slug },
  });

  return toProjectSummary(project, access.role);
}

export function getProject(access: ProjectAccess): ProjectSummary {
  // The access check already loaded the row; re-reading it would be a wasted round trip.
  return toProjectSummary(access.project, access.role);
}

export async function updateProject(
  db: Db,
  access: ProjectAccess,
  input: UpdateProjectRequest,
): Promise<ProjectSummary> {
  if (input.slug && (await isSlugTaken(db, access.workspaceId, input.slug, access.project.id))) {
    throw new ConflictError(`This workspace already has a project at "${input.slug}".`);
  }

  const project = await db.project.update({
    where: { id: access.project.id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      // `archived: false` restores, so the absent case and the false case differ.
      ...(input.archived === undefined ? {} : { archivedAt: input.archived ? new Date() : null }),
    },
  });

  return toProjectSummary(project, access.role);
}

/** Permanent, and cascades to revisions and assets. Archiving is the reversible option. */
export async function deleteProject(db: Db, access: ProjectAccess): Promise<void> {
  await db.project.delete({ where: { id: access.project.id } });
}
