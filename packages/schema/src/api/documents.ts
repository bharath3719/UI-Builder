import { z } from 'zod';
import { ProjectDocSchema } from '../doc.js';
import { DisplayName, Id } from './common.js';

/**
 * The document endpoints — PLAN.md §12, Phase 8.
 *
 * A save sends the whole document rather than a patch. The plan reached for JSON Patch,
 * and the reason it does not here is that the studio's history is a stack of whole
 * documents (`schema/ops` is pure and returns a new `Page`, sharing everything it did
 * not touch), so there is no patch lying around to send — producing one would mean
 * diffing two snapshots on every autosave purely to make the request smaller. A page's
 * worth of JSON is tens of kilobytes; the optimistic lock, not the payload size, is what
 * makes concurrent editing safe, and that is `baseVersion`.
 */

/**
 * `doc` is null for a project that has never been saved. That is a normal state, not an
 * error: a project row exists from the moment it is created, and its first document is
 * written by the first edit.
 */
export const DocumentResponse = z.object({
  doc: ProjectDocSchema.nullable(),
  /** D10 optimistic lock. 0 when `doc` is null. */
  version: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type DocumentResponse = z.infer<typeof DocumentResponse>;

export const SaveDocumentRequest = z.object({
  doc: ProjectDocSchema,
  /**
   * The version this edit was made against. The save is refused with 409 when the
   * project has moved on, which is what stops a second tab silently overwriting the
   * first.
   */
  baseVersion: z.number().int().nonnegative(),
  /**
   * Present only for an explicit "Save version". A labelled revision is a bookmark:
   * it is never overwritten by a later autosave, and it is what the history list is
   * for.
   */
  label: DisplayName.optional(),
});
export type SaveDocumentRequest = z.infer<typeof SaveDocumentRequest>;

export const SaveDocumentResponse = z.object({
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  /** The revision the document now lives in — new, or the head one updated in place. */
  revisionId: Id,
});
export type SaveDocumentResponse = z.infer<typeof SaveDocumentResponse>;

export const RevisionSummary = z.object({
  id: Id,
  version: z.number().int().positive(),
  label: z.string().nullable(),
  /** Null when the author's account has since been deleted. */
  authorName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** True for the revision the project currently points at — the live document. */
  current: z.boolean(),
});
export type RevisionSummary = z.infer<typeof RevisionSummary>;

export const RevisionList = z.array(RevisionSummary);
export type RevisionList = z.infer<typeof RevisionList>;

/** One revision with its document, for previewing or restoring it. */
export const RevisionDetail = RevisionSummary.extend({ doc: ProjectDocSchema });
export type RevisionDetail = z.infer<typeof RevisionDetail>;

/**
 * Restoring does not rewind history — it writes the old document forward as a new save,
 * so the state being replaced stays in the list and the restore itself is undoable by
 * restoring what came before it.
 */
export const RestoreRevisionResponse = z.object({
  doc: ProjectDocSchema,
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export type RestoreRevisionResponse = z.infer<typeof RestoreRevisionResponse>;
