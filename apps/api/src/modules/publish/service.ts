import { randomBytes } from 'node:crypto';
import {
  DocMigrationError,
  migrateDoc,
  slugify,
  type ProjectDoc,
  type PublishStateResponse,
  type PublishSummary,
  type PublishedPageResponse,
} from '@ui-builder/schema';
import type { Db } from '../../db/client.js';
import type { ProjectAccess } from '../../lib/access.js';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors.js';
import type { PublishModel } from '../../generated/prisma/models.js';

/**
 * Publishing — PLAN.md §12, Phase 9.
 *
 * The row points at a revision, not at the project, so what a link shows is fixed at the
 * moment it was published. Everything else here follows from that: republishing moves the
 * pointer, unpublishing deletes the row, and editing does neither.
 */

/** Same alphabet as node ids: URL-safe, unambiguous, no case to lose in a copy-paste. */
const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_LENGTH = 8;

/** Enough of the name to recognise the link, leaving room for the token. */
const SLUG_BASE_MAX = 32;

/**
 * `<name>-<token>`, e.g. `landing-page-k3f9d2q7`.
 *
 * The token is not decoration. The slug is the entire capability — anyone holding it can
 * read the document without signing in — so a slug derived from the name alone would let
 * anybody reach "acme-pricing" by typing it. Eight characters of this alphabet is ~41
 * bits, which is far past the point where guessing is a strategy, while the readable
 * prefix keeps a shared link recognisable to the person who sent it.
 */
function publicSlug(name: string): string {
  const base = slugify(name).slice(0, SLUG_BASE_MAX).replace(/-+$/, '') || 'page';

  let token = '';
  for (const byte of randomBytes(TOKEN_LENGTH)) {
    token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
  }

  return `${base}-${token}`;
}

/**
 * A free slug for this project.
 *
 * A collision needs two independent 41-bit tokens to match, so the loop is a formality;
 * the unique constraint is what actually guarantees correctness.
 */
async function allocateSlug(db: Db, name: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = publicSlug(name);
    const taken = await db.publish.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }

  throw new ConflictError('Could not allocate a link for this project. Please try again.');
}

function toSummary(publish: PublishModel, version: number): PublishSummary {
  return {
    slug: publish.slug,
    publishedAt: publish.publishedAt.toISOString(),
    revisionId: publish.revisionId,
    version,
  };
}

/**
 * The project's publish, or null.
 *
 * `findFirst` rather than `findUnique` because the table does not constrain a project to
 * one row — this service is what keeps it to one, and taking the newest is the honest
 * reading if a future phase ever writes a second.
 */
async function currentPublish(db: Db, projectId: string) {
  return db.publish.findFirst({
    where: { projectId },
    orderBy: { publishedAt: 'desc' },
    include: { revision: { select: { version: true } } },
  });
}

export async function getPublishState(
  db: Db,
  access: ProjectAccess,
): Promise<PublishStateResponse> {
  const publish = await currentPublish(db, access.project.id);
  return { publish: publish ? toSummary(publish, publish.revision.version) : null };
}

/**
 * Publishes the project's current revision, or moves an existing link forward to it.
 *
 * Republishing deliberately reuses the slug: a link that has been sent to someone must
 * keep working, and minting a second one would leave the first serving a stale document
 * with nothing in the UI admitting it exists.
 */
export async function publishProject(db: Db, access: ProjectAccess): Promise<PublishSummary> {
  const { project } = access;

  if (!project.currentRevisionId) {
    throw new ConflictError(
      'There is nothing to publish yet — this project has no saved document.',
    );
  }

  const revision = await db.projectRevision.findUnique({
    where: { id: project.currentRevisionId },
    select: { id: true, version: true },
  });

  if (!revision) {
    throw new ConflictError(
      'There is nothing to publish yet — this project has no saved document.',
    );
  }

  const existing = await currentPublish(db, project.id);

  if (existing) {
    const updated = await db.publish.update({
      where: { id: existing.id },
      data: { revisionId: revision.id, publishedAt: new Date() },
    });
    return toSummary(updated, revision.version);
  }

  const created = await db.publish.create({
    data: {
      projectId: project.id,
      revisionId: revision.id,
      slug: await allocateSlug(db, project.name),
    },
  });

  return toSummary(created, revision.version);
}

/**
 * Takes the link down. The slug is not reserved afterwards — publishing again allocates a
 * new one, which is the behaviour someone unpublishing is asking for: the old link stops
 * working, permanently.
 */
export async function unpublishProject(db: Db, access: ProjectAccess): Promise<void> {
  await db.publish.deleteMany({ where: { projectId: access.project.id } });
}

/* -------------------------------------------------------------------------- */
/* The public read                                                             */
/* -------------------------------------------------------------------------- */

class PublishedDocUnreadableError extends AppError {
  constructor(cause: unknown) {
    super(
      'internal_error',
      500,
      cause instanceof DocMigrationError
        ? `This page could not be read: ${cause.message}`
        : 'This page could not be read.',
      { cause },
    );
  }
}

/**
 * Resolves a shared link. **Anonymous** — the slug is the only credential.
 *
 * A missing slug and an unpublished one are the same 404 on purpose: distinguishing them
 * would turn the endpoint into an oracle for which links used to exist.
 */
export async function getPublishedPage(db: Db, slug: string): Promise<PublishedPageResponse> {
  const publish = await db.publish.findUnique({
    where: { slug },
    include: {
      project: { select: { name: true } },
      revision: { select: { doc: true } },
    },
  });

  if (!publish) {
    throw new NotFoundError('That page');
  }

  let doc: ProjectDoc;
  try {
    // The same migration every authenticated read goes through: a published document is
    // as old as the day it was published, and is exactly what needs migrating on load.
    doc = migrateDoc(publish.revision.doc);
  } catch (cause) {
    throw new PublishedDocUnreadableError(cause);
  }

  return {
    slug: publish.slug,
    projectName: publish.project.name,
    publishedAt: publish.publishedAt.toISOString(),
    doc,
  };
}
