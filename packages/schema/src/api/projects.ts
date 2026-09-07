import { z } from 'zod';
import { DisplayName, Id, Role, Slug } from './common.js';

export const CreateProjectRequest = z.object({
  name: DisplayName,
  /** Derived from `name` when omitted. Unique within the workspace, not globally. */
  slug: Slug.optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;

export const UpdateProjectRequest = z
  .object({
    name: DisplayName.optional(),
    slug: Slug.optional(),
    /** Archive or restore. Archived projects are hidden from the grid but not deleted. */
    archived: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'must change at least one field');
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequest>;

export const ProjectSummary = z.object({
  id: Id,
  workspaceId: Id,
  name: z.string(),
  slug: z.string(),
  thumbnailUrl: z.string().nullable(),
  /**
   * The calling user's role in the owning workspace — the same field `WorkspaceSummary`
   * carries, and for the same reason. The editor decides whether it is read-only before
   * it renders, and making that wait on a second request would mean either a flash of
   * editable chrome or a spinner in front of a document that has already loaded.
   */
  role: Role,
  /** D10 optimistic lock. 0 until the project has a saved document (Phase 8). */
  version: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});
export type ProjectSummary = z.infer<typeof ProjectSummary>;

/** Archived projects are excluded unless `includeArchived` is set. */
export const ListProjectsQuery = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type ListProjectsQuery = z.infer<typeof ListProjectsQuery>;
