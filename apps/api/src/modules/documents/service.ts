import {
  DocMigrationError,
  migrateDoc,
  type DocumentResponse,
  type ProjectDoc,
  type RestoreRevisionResponse,
  type RevisionDetail,
  type RevisionSummary,
  type SaveDocumentRequest,
  type SaveDocumentResponse,
} from '@ui-builder/schema';
import type { Db } from '../../db/client.js';
import type { ProjectAccess } from '../../lib/access.js';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors.js';

/**
 * How close together two autosaves have to be for the second to overwrite the first's
 * revision rather than adding one (PLAN.md §4).
 *
 * The head revision *is* the live document — it is what `Project.currentRevisionId`
 * points at — so an autosave inside the window edits it in place. Without that, a
 * twenty-minute styling session would leave several hundred rows nobody will ever open,
 * and the useful ones would be buried in them. Older revisions are never touched again;
 * "immutable history" is true of everything the head has moved past.
 */
export const REVISION_INTERVAL_MS = 60_000;

/** Whatever Prisma hands back for a `Json` column, before it has been trusted. */
type StoredDoc = unknown;

/**
 * A stored document that will not migrate is a corrupted row or a bug in a migration,
 * and either way it is not the caller's fault or something they can retry — but they do
 * need to be told which project failed rather than staring at a generic 500.
 */
class DocumentUnreadableError extends AppError {
  constructor(cause: unknown) {
    super(
      'internal_error',
      500,
      cause instanceof DocMigrationError
        ? `This project's saved document could not be read: ${cause.message}`
        : "This project's saved document could not be read.",
      { cause },
    );
  }
}

/**
 * Every read goes through the migration chain, so the rest of the system only ever sees
 * a document at the current schema version. The stored row is left alone until the next
 * save rewrites it — a read is not a good enough reason to write.
 */
function readDoc(stored: StoredDoc): ProjectDoc {
  try {
    return migrateDoc(stored);
  } catch (cause) {
    throw new DocumentUnreadableError(cause);
  }
}

export async function getDocument(db: Db, access: ProjectAccess): Promise<DocumentResponse> {
  const { project } = access;

  if (!project.currentRevisionId) {
    // Never saved. Not an error — the studio seeds a starter document and the first
    // edit writes it.
    return { doc: null, version: project.version, updatedAt: project.updatedAt.toISOString() };
  }

  const revision = await db.projectRevision.findUnique({
    where: { id: project.currentRevisionId },
    select: { doc: true },
  });

  if (!revision) {
    // The column is a foreign key with `onDelete: SetNull`, so this is unreachable
    // short of a manual delete — but answering "no document" is a better failure than
    // a null dereference three layers up.
    return { doc: null, version: project.version, updatedAt: project.updatedAt.toISOString() };
  }

  return {
    doc: readDoc(revision.doc),
    version: project.version,
    updatedAt: project.updatedAt.toISOString(),
  };
}

/**
 * Writes the document, refusing the save if the project has moved on since the client
 * read it (D10).
 *
 * The lock is a conditional `updateMany` on `version` rather than a read-then-write:
 * two saves racing on the same base version both pass a read, and only one can match
 * the `where` clause. It runs inside the transaction that writes the revision, so a
 * failure after the bump cannot leave a version pointing at the old document.
 */
export async function saveDocument(
  db: Db,
  access: ProjectAccess,
  authorId: string,
  input: SaveDocumentRequest,
): Promise<SaveDocumentResponse> {
  const projectId = access.project.id;

  return db.$transaction(async (tx) => {
    const nextVersion = input.baseVersion + 1;

    const claimed = await tx.project.updateMany({
      where: { id: projectId, version: input.baseVersion },
      data: { version: nextVersion },
    });

    if (claimed.count !== 1) {
      const current = await tx.project.findUnique({
        where: { id: projectId },
        select: { version: true },
      });

      throw new ConflictError(
        current
          ? `This project has been changed elsewhere (you edited version ${input.baseVersion}, it is now at ${current.version}).`
          : 'That project no longer exists.',
      );
    }

    const head = access.project.currentRevisionId
      ? await tx.projectRevision.findUnique({
          where: { id: access.project.currentRevisionId },
          select: {
            id: true,
            label: true,
            createdAt: true,
            authorId: true,
            // Whether a shared link points at this row. `take: 1` because the question is
            // "is anything holding it?", not how many things are.
            publishes: { select: { id: true }, take: 1 },
          },
        })
      : null;

    const now = new Date();
    const startNewRevision =
      !head ||
      // An explicit "Save version" always gets its own row, and a labelled one is a
      // bookmark that a later autosave must never overwrite.
      input.label !== undefined ||
      head.label !== null ||
      // A published link points at this revision (Phase 9). Overwriting it in place would
      // silently change what an already-shared URL serves, which is the one thing a
      // snapshot must not do — so a save after a publish always starts a new row and the
      // published one is left frozen where it is.
      head.publishes.length > 0 ||
      // A different person's work is their own entry in the history, however quickly
      // it followed.
      head.authorId !== authorId ||
      now.getTime() - head.createdAt.getTime() >= REVISION_INTERVAL_MS;

    const doc = input.doc as unknown as object;

    if (startNewRevision) {
      const revision = await tx.projectRevision.create({
        data: {
          projectId,
          doc,
          version: nextVersion,
          authorId,
          ...(input.label === undefined ? {} : { label: input.label }),
        },
        select: { id: true },
      });

      const project = await tx.project.update({
        where: { id: projectId },
        data: { currentRevisionId: revision.id },
        select: { updatedAt: true },
      });

      return {
        version: nextVersion,
        updatedAt: project.updatedAt.toISOString(),
        revisionId: revision.id,
      };
    }

    await tx.projectRevision.update({
      where: { id: head.id },
      data: { doc, version: nextVersion },
    });

    // `updatedAt` is `@updatedAt`, so the version bump above already moved it; this
    // read is what reports the value the row actually landed on.
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { updatedAt: true },
    });

    return {
      version: nextVersion,
      updatedAt: project.updatedAt.toISOString(),
      revisionId: head.id,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

/** Newest first, and without the documents — a list of fifty docs is megabytes. */
export async function listRevisions(
  db: Db,
  access: ProjectAccess,
  { limit }: { limit: number },
): Promise<RevisionSummary[]> {
  const revisions = await db.projectRevision.findMany({
    where: { projectId: access.project.id },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      version: true,
      label: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  return revisions.map((revision) => ({
    id: revision.id,
    version: revision.version,
    label: revision.label,
    authorName: revision.author?.name ?? null,
    createdAt: revision.createdAt.toISOString(),
    current: revision.id === access.project.currentRevisionId,
  }));
}

async function requireRevision(db: Db, access: ProjectAccess, revisionId: string) {
  const revision = await db.projectRevision.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      projectId: true,
      doc: true,
      version: true,
      label: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  // Scoped by project as well as id: a revision id from another project would otherwise
  // be readable by anyone with access to any project at all.
  if (!revision || revision.projectId !== access.project.id) {
    throw new NotFoundError('That revision');
  }

  return revision;
}

export async function getRevision(
  db: Db,
  access: ProjectAccess,
  revisionId: string,
): Promise<RevisionDetail> {
  const revision = await requireRevision(db, access, revisionId);

  return {
    id: revision.id,
    version: revision.version,
    label: revision.label,
    authorName: revision.author?.name ?? null,
    createdAt: revision.createdAt.toISOString(),
    current: revision.id === access.project.currentRevisionId,
    doc: readDoc(revision.doc),
  };
}

/**
 * Restores by saving the old document forward, not by rewinding.
 *
 * The state being replaced therefore stays in the list, and undoing a restore is just
 * restoring the revision above it. Rewinding — deleting everything after the chosen
 * row — would make the one destructive operation in the history panel the one that
 * looks like a safety net.
 */
export async function restoreRevision(
  db: Db,
  access: ProjectAccess,
  authorId: string,
  revisionId: string,
): Promise<RestoreRevisionResponse> {
  const revision = await requireRevision(db, access, revisionId);
  const doc = readDoc(revision.doc);

  const saved = await saveDocument(db, access, authorId, {
    doc,
    baseVersion: access.project.version,
    label: revision.label ?? `Restored version ${revision.version}`,
  });

  return { doc, version: saved.version, updatedAt: saved.updatedAt };
}
