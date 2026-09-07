import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  DOC_SCHEMA_VERSION,
  SLUG_PATTERN,
  type ApiErrorResponse,
  type ProjectDoc,
  type PublishStateResponse,
  type PublishSummary,
  type PublishedPageResponse,
  type SaveDocumentResponse,
  type WorkspaceSummary,
} from '@ui-builder/schema';
import { createTestApi, type TestApi, type TestUser } from '../../test/api.js';
import { createProject, createWorkspaceWithRoles } from '../../test/fixtures.js';

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

/** Minimal but valid, and built from the schema alone — the API must not import the
 * component library (PLAN.md §2). Same reasoning as the documents suite. */
function makeDoc(heading = 'Hello'): ProjectDoc {
  const rootId = 'root0000ab';
  const textId = 'text0000cd';

  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: 'doc1',
    name: 'Landing',
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
            props: { text: { kind: 'static', value: heading } },
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

async function save(
  projectId: string,
  as: TestUser,
  body: { doc: ProjectDoc; baseVersion: number },
): Promise<SaveDocumentResponse> {
  const response = await api.put(`/api/projects/${projectId}/document`, { as, body });
  if (response.statusCode !== 200) {
    throw new Error(`save expected 200, got ${response.statusCode}: ${response.body}`);
  }
  return response.json<SaveDocumentResponse>();
}

async function publish(projectId: string, as: TestUser): Promise<PublishSummary> {
  const response = await api.post(`/api/projects/${projectId}/publish`, { as });
  if (response.statusCode !== 200) {
    throw new Error(`publish expected 200, got ${response.statusCode}: ${response.body}`);
  }
  return response.json<PublishSummary>();
}

/** The heading text of the first page — what a published document is checked by here. */
function headingOf(doc: ProjectDoc): unknown {
  const page = doc.pages[0];
  const node = page ? Object.values(page.nodes).find((entry) => entry.type === 'Heading') : null;
  const text = node?.props.text;
  return text && text.kind === 'static' ? text.value : undefined;
}

/**
 * PLAN.md §12, Phase 9: "the shared link opens for a logged-out user".
 *
 * `api.get` without `as` sends no Authorization header at all, so this is exactly the
 * request a browser with no session makes.
 */
describe('Phase 9 acceptance', () => {
  it('serves a published page to an anonymous caller', async () => {
    const { projectId, owner } = await setup();
    await save(projectId, owner, { doc: makeDoc('Published headline'), baseVersion: 0 });

    const published = await publish(projectId, owner);
    expect(published.slug).toMatch(SLUG_PATTERN);
    // The readable prefix comes from the project name; the token is what makes it a
    // capability rather than a guess.
    expect(published.slug.startsWith('landing-page-')).toBe(true);

    const anonymous = await api.get(`/api/published/${published.slug}`);
    expect(anonymous.statusCode).toBe(200);

    const page = anonymous.json<PublishedPageResponse>();
    expect(page.projectName).toBe('Landing page');
    expect(headingOf(page.doc)).toBe('Published headline');
    // Nothing about the account behind the link travels with it.
    expect(Object.keys(page).sort()).toEqual(['doc', 'projectName', 'publishedAt', 'slug']);
  });
});

describe('publishing', () => {
  it('refuses to publish a project with no saved document', async () => {
    const { projectId, owner } = await setup();

    const response = await api.post(`/api/projects/${projectId}/publish`, { as: owner });
    expect(response.statusCode).toBe(409);
    expect(response.json<ApiErrorResponse>().error.code).toBe('conflict');
  });

  it('reports no publish before one exists', async () => {
    const { projectId, owner } = await setup();

    const response = await api.get(`/api/projects/${projectId}/publish`, { as: owner });
    expect(response.statusCode).toBe(200);
    expect(response.json<PublishStateResponse>().publish).toBeNull();
  });

  it('serves the published snapshot, not the live document', async () => {
    const { projectId, owner } = await setup();
    const first = await save(projectId, owner, { doc: makeDoc('Version one'), baseVersion: 0 });

    const link = await publish(projectId, owner);
    expect(link.version).toBe(first.version);

    // Editing after publishing must not change what the link already handed out.
    await save(projectId, owner, { doc: makeDoc('Version two'), baseVersion: first.version });

    const stale = await api.get(`/api/published/${link.slug}`);
    expect(headingOf(stale.json<PublishedPageResponse>().doc)).toBe('Version one');

    // Republishing moves the same link forward rather than minting a second one.
    const updated = await publish(projectId, owner);
    expect(updated.slug).toBe(link.slug);
    expect(updated.version).toBe(first.version + 1);

    const fresh = await api.get(`/api/published/${link.slug}`);
    expect(headingOf(fresh.json<PublishedPageResponse>().doc)).toBe('Version two');
    expect(await api.db.publish.count({ where: { projectId } })).toBe(1);
  });

  it('stops serving the link once it is unpublished', async () => {
    const { projectId, owner } = await setup();
    await save(projectId, owner, { doc: makeDoc(), baseVersion: 0 });
    const link = await publish(projectId, owner);

    const removed = await api.delete(`/api/projects/${projectId}/publish`, { as: owner });
    expect(removed.statusCode).toBe(204);

    const gone = await api.get(`/api/published/${link.slug}`);
    expect(gone.statusCode).toBe(404);

    const state = await api.get(`/api/projects/${projectId}/publish`, { as: owner });
    expect(state.json<PublishStateResponse>().publish).toBeNull();
  });

  it('404s an unknown slug and rejects a malformed one', async () => {
    // Both are 404 from the caller's side for the same reason: the endpoint must not be
    // an oracle for which links used to exist.
    expect((await api.get('/api/published/nothing-here-at-all')).statusCode).toBe(404);
    expect((await api.get('/api/published/Not A Slug')).statusCode).toBe(400);
  });
});

describe('who may publish', () => {
  it('lets an editor publish and a viewer only read the state', async () => {
    const { projectId, owner, editor, viewer, outsider } = await setup();
    await save(projectId, owner, { doc: makeDoc(), baseVersion: 0 });

    const byEditor = await api.post(`/api/projects/${projectId}/publish`, { as: editor });
    expect(byEditor.statusCode).toBe(200);

    const seenByViewer = await api.get(`/api/projects/${projectId}/publish`, { as: viewer });
    expect(seenByViewer.statusCode).toBe(200);
    expect(seenByViewer.json<PublishStateResponse>().publish?.slug).toBe(
      byEditor.json<PublishSummary>().slug,
    );

    expect((await api.post(`/api/projects/${projectId}/publish`, { as: viewer })).statusCode).toBe(
      403,
    );
    expect(
      (await api.delete(`/api/projects/${projectId}/publish`, { as: viewer })).statusCode,
    ).toBe(403);
    expect((await api.get(`/api/projects/${projectId}/publish`, { as: outsider })).statusCode).toBe(
      403,
    );
    // The project routes are the ones that need a session; the public read is the only
    // route in this module that does not.
    expect((await api.get(`/api/projects/${projectId}/publish`)).statusCode).toBe(401);
  });
});
