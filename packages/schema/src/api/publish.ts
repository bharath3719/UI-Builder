import { z } from 'zod';
import { ProjectDocSchema } from '../doc.js';
import { Id } from './common.js';

/**
 * Publishing — PLAN.md §12, Phase 9.
 *
 * A publish is a *snapshot*: the row points at the revision that was live when the
 * button was pressed, not at the project. Editing afterwards therefore cannot change
 * what a link already handed out shows, which is the only behaviour that makes a shared
 * link safe to send — the alternative is a reviewer opening a half-finished redesign
 * because someone kept working after sharing.
 *
 * There is one publish per project. The table allows more (Phase 12's hosting may want a
 * history of them) but the service keeps a single row, so republishing moves the same
 * link forward rather than minting a second one nobody knows about.
 */

export const PublishSummary = z.object({
  /** The public path segment: `/s/<slug>`. */
  slug: z.string(),
  publishedAt: z.iso.datetime(),
  /** The revision being served — a snapshot, not the live document. */
  revisionId: Id,
  /**
   * The project version that revision was saved at. The studio compares it with
   * `ProjectSummary.version` to say whether the link is behind the document on screen.
   */
  version: z.number().int().positive(),
});
export type PublishSummary = z.infer<typeof PublishSummary>;

/** `null` for a project that has never been published, which is the normal state. */
export const PublishStateResponse = z.object({ publish: PublishSummary.nullable() });
export type PublishStateResponse = z.infer<typeof PublishStateResponse>;

/**
 * What a shared link resolves to.
 *
 * Anonymous-readable, so it carries only what a page needs to render itself: no project
 * id, no workspace, no author, no version history. The slug is the whole capability, and
 * nothing behind it should describe the account it belongs to.
 */
export const PublishedPageResponse = z.object({
  slug: z.string(),
  /** Used as the document title. The project's name, not the workspace's. */
  projectName: z.string(),
  publishedAt: z.iso.datetime(),
  doc: ProjectDocSchema,
});
export type PublishedPageResponse = z.infer<typeof PublishedPageResponse>;
