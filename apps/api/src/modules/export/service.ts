import { projectArchive, type ProjectArchive } from '@ui-builder/codegen';
import type { Db } from '../../db/client.js';
import type { ProjectAccess } from '../../lib/access.js';
import { ConflictError } from '../../lib/errors.js';
import { getDocument } from '../documents/service.js';

/**
 * The project's code, as a zip — PLAN.md §12, Phase 10.
 *
 * The document is read through `documents.getDocument` rather than queried here, so an
 * export goes through the same migration chain as everything else that reads a stored
 * document. An export of an unmigrated row would generate code against a schema the rest
 * of the system no longer speaks.
 *
 * The generation itself is `@ui-builder/codegen`, which is pure: this function adds a
 * database read and nothing else. That is deliberate — the studio calls the same function
 * in the browser, and anything decided here rather than there would be a difference
 * between the download button and this route.
 */
export async function exportProject(db: Db, access: ProjectAccess): Promise<ProjectArchive> {
  const { doc } = await getDocument(db, access);

  if (!doc) {
    // A project that has never been saved has no document to generate from. 409 rather
    // than 404: the project is there, it just has nothing in it yet, and the fix is to
    // open it and make an edit rather than to look for a different id.
    throw new ConflictError('This project has not been saved yet, so there is nothing to export.');
  }

  return projectArchive(doc);
}
