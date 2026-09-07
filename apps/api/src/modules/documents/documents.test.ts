import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DOC_SCHEMA_VERSION,
  DEFAULT_THEME,
  type ApiErrorResponse,
  type DocumentResponse,
  type ProjectDoc,
  type RestoreRevisionResponse,
  type RevisionDetail,
  type RevisionSummary,
  type SaveDocumentResponse,
  type WorkspaceSummary,
} from '@ui-builder/schema';
import { createTestApi, type TestApi, type TestUser } from '../../test/api.js';
import { createProject, createWorkspaceWithRoles } from '../../test/fixtures.js';
import { REVISION_INTERVAL_MS } from './service.js';

let api: TestApi;

beforeAll(async () => {
  api = await createTestApi();
});

afterAll(async () => {
  await api.close();
});

beforeEach(async () => {
  await api.reset();
});

/**
 * A minimal but valid document, built from the schema alone.
 *
 * Deliberately not `createProjectDoc` from `@ui-builder/components`: the API must not
 * depend on the component library (PLAN.md §2), and a test that reached for it would be
 * the first crack in that.
 */
function makeDoc(overrides: { name?: string; heading?: string } = {}): ProjectDoc {
  const rootId = 'root0000ab';
  const textId = 'text0000cd';

  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: 'doc1',
    name: overrides.name ?? 'Landing',
    pages: [
      {
        id: 'page1',
        name: 'Home',
        path: '/',
        rootId,
        nodes: {
          [rootId]: {
            id: rootId,
            parentId: null,
            type: 'Box',
            name: 'Page',
            children: [textId],
            props: {},
            styles: { base: { default: { padding: 32 } } },
            events: {},
          },
          [textId]: {
            id: textId,
            parentId: rootId,
            type: 'Heading',
            name: 'Heading',
            children: [],
            props: { text: { kind: 'static', value: overrides.heading ?? 'Hello' } },
            styles: {},
            events: {},
          },
        },
        state: [],
        queries: [],
      },
    ],
    symbols: [],
    theme: DEFAULT_THEME,
  };
}

async function setup(): Promise<{
  workspace: WorkspaceSummary;
  owner: TestUser;
  editor: TestUser;
  viewer: TestUser;
  outsider: TestUser;
  projectId: string;
}> {
  const roles = await createWorkspaceWithRoles(api);
  const project = await createProject(api, roles.owner, roles.workspace.id);
  return { ...roles, projectId: project.id };
}

/** Saves and asserts it was accepted, returning the version it landed on. */
async function save(
  projectId: string,
  as: TestUser,
  body: { doc: ProjectDoc; baseVersion: number; label?: string },
): Promise<SaveDocumentResponse> {
  const response = await api.put(`/api/projects/${projectId}/document`, { as, body });
  if (response.statusCode !== 200) {
    throw new Error(`save expected 200, got ${response.statusCode}: ${response.body}`);
  }
  return response.json<SaveDocumentResponse>();
}

/** The revision list, newest first, asserting the request succeeded. */
async function revisionsOf(projectId: string, as: TestUser): Promise<RevisionSummary[]> {
  const response = await api.get(`/api/projects/${projectId}/revisions`, { as });
  if (response.statusCode !== 200) {
    throw new Error(`revisions expected 200, got ${response.statusCode}: ${response.body}`);
  }
  return response.json<RevisionSummary[]>();
}

/** Narrows away the `undefined` an index lookup carries, failing loudly instead. */
function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an item at index ${index}`);
  return item;
}

/**
 * Backdates every revision on a project so the next save is outside the throttle window.
 * The alternative is a test that sleeps for a minute.
 */
async function ageRevisions(projectId: string): Promise<void> {
  await api.db.projectRevision.updateMany({
    where: { projectId },
    data: { createdAt: new Date(Date.now() - REVISION_INTERVAL_MS - 1000) },
  });
}

/**
 * PLAN.md §12, Phase 8: "a hard refresh loses nothing, and two tabs editing the same
 * project produce a detected conflict rather than silent loss."
 *
 * The refresh half is the round trip below — what a reload does is exactly this GET.
 */
describe('Phase 8 acceptance', () => {
  it('round-trips a document, and refuses the second of two tabs', async () => {
    const { projectId, owner } = await setup();

    // A project with no document yet is not an error; it is where every project starts.
    const empty = await api.get(`/api/projects/${projectId}/document`, { as: owner });
    expect(empty.statusCode).toBe(200);
    expect(empty.json<DocumentResponse>()).toMatchObject({ doc: null, version: 0 });

    const saved = await save(projectId, owner, { doc: makeDoc(), baseVersion: 0 });
    expect(saved.version).toBe(1);

    const reloaded = await api.get(`/api/projects/${projectId}/document`, { as: owner });
    const body = reloaded.json<DocumentResponse>();
    expect(body.version).toBe(1);
    expect(body.doc).toEqual(makeDoc());

    // Two tabs: both read version 1, both edit, both save.
    const first = await api.put(`/api/projects/${projectId}/document`, {
      as: owner,
      body: { doc: makeDoc({ heading: 'From tab one' }), baseVersion: 1 },
    });
    expect(first.statusCode).toBe(200);

    const second = await api.put(`/api/projects/${projectId}/document`, {
      as: owner,
      body: { doc: makeDoc({ heading: 'From tab two' }), baseVersion: 1 },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json<ApiErrorResponse>().error.code).toBe('conflict');

    // And the first tab's work is intact rather than half-overwritten.
    const after = await api.get(`/api/projects/${projectId}/document`, { as: owner });
    expect(after.json<DocumentResponse>().doc).toEqual(makeDoc({ heading: 'From tab one' }));
  });
});

describe('PUT /api/projects/:id/document', () => {
  it('needs the editor role', async () => {
    const { projectId, editor, viewer, outsider } = await setup();

    const asEditor = await api.put(`/api/projects/${projectId}/document`, {
      as: editor,
      body: { doc: makeDoc(), baseVersion: 0 },
    });
    expect(asEditor.statusCode).toBe(200);

    const asViewer = await api.put(`/api/projects/${projectId}/document`, {
      as: viewer,
      body: { doc: makeDoc(), baseVersion: 1 },
    });
    expect(asViewer.statusCode).toBe(403);

    const asOutsider = await api.put(`/api/projects/${projectId}/document`, {
      as: outsider,
      body: { doc: makeDoc(), baseVersion: 1 },
    });
    expect(asOutsider.statusCode).toBe(403);
  });

  it('rejects a document that is not a document', async () => {
    const { projectId, owner } = await setup();

    const response = await api.put(`/api/projects/${projectId}/document`, {
      as: owner,
      body: { doc: { schemaVersion: 1, id: 'x', name: 'x', pages: [] }, baseVersion: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.code).toBe('validation_error');
  });

  it('leaves the version alone when a save is refused', async () => {
    const { projectId, owner } = await setup();
    await save(projectId, owner, { doc: makeDoc(), baseVersion: 0 });

    const stale = await api.put(`/api/projects/${projectId}/document`, {
      as: owner,
      body: { doc: makeDoc({ heading: 'stale' }), baseVersion: 0 },
    });
    expect(stale.statusCode).toBe(409);

    // The rejected save must not have bumped the lock it failed against, or the next
    // one from the same tab would be refused for a different reason.
    const after = await api.get(`/api/projects/${projectId}/document`, { as: owner });
    expect(after.json<DocumentResponse>().version).toBe(1);
  });

  it('bumps the version on the project summary too', async () => {
    const { projectId, owner } = await setup();
    await save(projectId, owner, { doc: makeDoc(), baseVersion: 0 });

    const project = await api.get(`/api/projects/${projectId}`, { as: owner });
    expect(project.json<{ version: number }>().version).toBe(1);
  });
});

describe('revision throttling', () => {
  it('overwrites the head revision for a save inside the window', async () => {
    const { projectId, owner } = await setup();

    const first = await save(projectId, owner, {
      doc: makeDoc({ heading: 'one' }),
      baseVersion: 0,
    });
    const second = await save(projectId, owner, {
      doc: makeDoc({ heading: 'two' }),
      baseVersion: 1,
    });

    // Same row, moved forward — not a second one. Otherwise a styling session leaves
    // hundreds of rows nobody will open.
    expect(second.revisionId).toBe(first.revisionId);

    const list = await api.get(`/api/projects/${projectId}/revisions`, { as: owner });
    expect(list.json<RevisionSummary[]>()).toHaveLength(1);

    // And the head still holds the latest document.
    const current = await api.get(`/api/projects/${projectId}/document`, { as: owner });
    expect(current.json<DocumentResponse>().doc).toEqual(makeDoc({ heading: 'two' }));
  });

  it('starts a new revision once the window has passed', async () => {
    const { projectId, owner } = await setup();

    const first = await save(projectId, owner, {
      doc: makeDoc({ heading: 'one' }),
      baseVersion: 0,
    });
    await ageRevisions(projectId);
    const second = await save(projectId, owner, {
      doc: makeDoc({ heading: 'two' }),
      baseVersion: 1,
    });

    expect(second.revisionId).not.toBe(first.revisionId);

    const list = await api.get(`/api/projects/${projectId}/revisions`, { as: owner });
    const revisions = list.json<RevisionSummary[]>();
    expect(revisions).toHaveLength(2);
    // Newest first, and the head is flagged.
    expect(revisions[0]).toMatchObject({ version: 2, current: true });
    expect(revisions[1]).toMatchObject({ version: 1, current: false });
  });

  it('gives a labelled save its own revision and never overwrites it', async () => {
    const { projectId, owner } = await setup();

    await save(projectId, owner, { doc: makeDoc({ heading: 'one' }), baseVersion: 0 });
    const labelled = await save(projectId, owner, {
      doc: makeDoc({ heading: 'two' }),
      baseVersion: 1,
      label: 'Before the redesign',
    });
    // Immediately afterwards, well inside the throttle window: the bookmark must survive.
    const after = await save(projectId, owner, {
      doc: makeDoc({ heading: 'three' }),
      baseVersion: 2,
    });

    expect(after.revisionId).not.toBe(labelled.revisionId);

    const list = await api.get(`/api/projects/${projectId}/revisions`, { as: owner });
    const revisions = list.json<RevisionSummary[]>();
    expect(revisions).toHaveLength(3);

    // The bookmark is still the version it was taken at, holding the document it held.
    const bookmark = revisions.find((revision) => revision.id === labelled.revisionId);
    expect(bookmark).toMatchObject({ label: 'Before the redesign', version: 2 });

    const stored = await api.get(`/api/projects/${projectId}/revisions/${labelled.revisionId}`, {
      as: owner,
    });
    expect(stored.json<RevisionDetail>().doc).toEqual(makeDoc({ heading: 'two' }));
  });

  it('gives a second author their own revision', async () => {
    const { projectId, owner, editor } = await setup();

    const first = await save(projectId, owner, {
      doc: makeDoc({ heading: 'one' }),
      baseVersion: 0,
    });
    const second = await save(projectId, editor, {
      doc: makeDoc({ heading: 'two' }),
      baseVersion: 1,
    });

    expect(second.revisionId).not.toBe(first.revisionId);

    const list = await api.get(`/api/projects/${projectId}/revisions`, { as: owner });
    expect(list.json<RevisionSummary[]>().map((r) => r.authorName)).toEqual(['Editor', 'Owner']);
  });
});

describe('GET /api/projects/:id/revisions', () => {
  it('is readable by a viewer and closed to an outsider', async () => {
    const { projectId, owner, viewer, outsider } = await setup();
    await save(projectId, owner, { doc: makeDoc(), baseVersion: 0 });

    expect((await api.get(`/api/projects/${projectId}/revisions`, { as: viewer })).statusCode).toBe(
      200,
    );
    expect(
      (await api.get(`/api/projects/${projectId}/revisions`, { as: outsider })).statusCode,
    ).toBe(403);
  });

  it('will not hand over a revision belonging to another project', async () => {
    const { projectId, owner, workspace } = await setup();
    await save(projectId, owner, { doc: makeDoc(), baseVersion: 0 });

    const other = await createProject(api, owner, workspace.id, { name: 'Other' });
    await save(other.id, owner, { doc: makeDoc(), baseVersion: 0 });

    const revision = at(await revisionsOf(projectId, owner), 0);

    // The id is valid and the caller has access to both projects — but a revision is
    // addressed through its own project or not at all.
    const crossed = await api.get(`/api/projects/${other.id}/revisions/${revision.id}`, {
      as: owner,
    });
    expect(crossed.statusCode).toBe(404);
  });

  it('returns one revision with its document', async () => {
    const { projectId, owner } = await setup();
    await save(projectId, owner, { doc: makeDoc({ heading: 'one' }), baseVersion: 0 });

    const summary = at(await revisionsOf(projectId, owner), 0);

    const detail = await api.get(`/api/projects/${projectId}/revisions/${summary.id}`, {
      as: owner,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json<RevisionDetail>().doc).toEqual(makeDoc({ heading: 'one' }));
  });
});

describe('POST /api/projects/:id/revisions/:revisionId/restore', () => {
  it('writes the old document forward rather than rewinding', async () => {
    const { projectId, owner } = await setup();

    await save(projectId, owner, { doc: makeDoc({ heading: 'original' }), baseVersion: 0 });
    await ageRevisions(projectId);
    await save(projectId, owner, { doc: makeDoc({ heading: 'replacement' }), baseVersion: 1 });

    const list = await api.get(`/api/projects/${projectId}/revisions`, { as: owner });
    const original = list.json<RevisionSummary[]>().find((r) => r.version === 1);

    const restored = await api.post(
      `/api/projects/${projectId}/revisions/${original?.id}/restore`,
      { as: owner },
    );
    expect(restored.statusCode).toBe(200);

    const body = restored.json<RestoreRevisionResponse>();
    expect(body.doc).toEqual(makeDoc({ heading: 'original' }));
    expect(body.version).toBe(3);

    // The document that was replaced is still in the list, so the restore is itself
    // reversible.
    const after = await api.get(`/api/projects/${projectId}/revisions`, { as: owner });
    const revisions = after.json<RevisionSummary[]>();
    expect(revisions).toHaveLength(3);
    expect(revisions[0]).toMatchObject({ version: 3, current: true, label: 'Restored version 1' });

    const current = await api.get(`/api/projects/${projectId}/document`, { as: owner });
    expect(current.json<DocumentResponse>().doc).toEqual(makeDoc({ heading: 'original' }));
  });

  it('needs the editor role', async () => {
    const { projectId, owner, viewer } = await setup();
    await save(projectId, owner, { doc: makeDoc(), baseVersion: 0 });

    const revision = at(await revisionsOf(projectId, owner), 0);

    const response = await api.post(`/api/projects/${projectId}/revisions/${revision.id}/restore`, {
      as: viewer,
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('GET /api/projects/:id/document', () => {
  it('rejects a stored document written by a newer build', async () => {
    const { projectId, owner } = await setup();
    await save(projectId, owner, { doc: makeDoc(), baseVersion: 0 });

    // Simulates a rollback: the row on disk is ahead of the code reading it. Written
    // through Prisma directly, because no route would accept it.
    await api.db.projectRevision.updateMany({
      where: { projectId },
      data: {
        doc: { ...makeDoc(), schemaVersion: DOC_SCHEMA_VERSION + 1 } as unknown as object,
      },
    });

    const response = await api.get(`/api/projects/${projectId}/document`, { as: owner });
    expect(response.statusCode).toBe(500);
    expect(response.json<ApiErrorResponse>().error.message).toMatch(/newer version/i);
  });
});
