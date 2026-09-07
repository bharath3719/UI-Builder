import { z } from 'zod';
import { DisplayName, Id, Role, Slug } from './common.js';
import { Email } from './auth.js';

export const CreateWorkspaceRequest = z.object({
  name: DisplayName,
  /** Derived from `name` when omitted, with a numeric suffix if that is taken. */
  slug: Slug.optional(),
});
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequest>;

export const UpdateWorkspaceRequest = z
  .object({
    name: DisplayName.optional(),
    slug: Slug.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'must change at least one field');
export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequest>;

/** A workspace plus the calling user's role in it — the shape the switcher needs. */
export const WorkspaceSummary = z.object({
  id: Id,
  name: z.string(),
  slug: z.string(),
  role: Role,
  projectCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummary>;

export const WorkspaceMemberSummary = z.object({
  id: Id,
  userId: Id,
  email: z.string(),
  name: z.string(),
  role: Role,
  createdAt: z.iso.datetime(),
});
export type WorkspaceMemberSummary = z.infer<typeof WorkspaceMemberSummary>;

/** Invites by email. The user must already have an account — no email sending in Phase 1. */
export const AddMemberRequest = z.object({
  email: Email,
  role: Role,
});
export type AddMemberRequest = z.infer<typeof AddMemberRequest>;

export const UpdateMemberRequest = z.object({
  role: Role,
});
export type UpdateMemberRequest = z.infer<typeof UpdateMemberRequest>;
