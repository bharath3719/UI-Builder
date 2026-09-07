import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  DOC_SCHEMA_VERSION,
  type ApiErrorResponse,
  type ProjectDoc,
  type SaveDocumentResponse,
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

/** Built from the schema alone — the document's shape must not depend on the library. */
function makeDoc(type = 'Heading'): ProjectDoc {
  const rootId = 'root0000ab';
  const childId = 'chld0000cd';

  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: 'doc1',
    name: 'Landing Page',
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
            children: [childId],
            props: {},
            styles: { base: { default: { padding: 32 } } },
            events: {},
          },
          [childId]: {
            id: childId,
            parentId: rootId,
            type,
            name: 'Title',
            children: [],
            props: { text: { kind: 'static', value: 'Hello' } },
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

async function saveDoc(actor: TestUser, projectId: string, doc: ProjectDoc): Promise<void> {
  const response = await api.put(`/api/projects/${projectId}/document`, {
    as: actor,
    body: { doc, baseVersion: 0 },
  });
  if (response.statusCode !== 200) {
    throw new Error(`saveDoc expected 200, got ${response.statusCode}: ${response.body}`);
  }
  response.json<SaveDocumentResponse>();
}

/**
 * Reads the archive's entry names out of its central directory.
 *
 * Deliberately not `@ui-builder/codegen`'s own reader: this suite is asking whether the
 * bytes that came down the wire are a zip, and borrowing the writer's companion parser
 * would make a route that returned the wrong body pass anyway.
 */
function entryNames(body: Buffer): string[] {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const end = body.length - 22;

  expect(view.getUint32(end, true)).toBe(0x06054b50);

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const names: string[] = [];

  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(at + 28, true);
    names.push(body.subarray(at + 46, at + 46 + nameLength).toString('utf8'));
    at += 46 + nameLength;
  }

  return names;
}

describe('GET /api/projects/:projectId/export', () => {
  it('answers with a zip of the generated project', async () => {
    const { workspace, owner } = await createWorkspaceWithRoles(api);
    const project = await createProject(api, owner, workspace.id);
    await saveDoc(owner, project.id, makeDoc());

    const response = await api.get(`/api/projects/${project.id}/export`, { as: owner });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    // Named from the document, not the project row, and slugged on the way out.
    expect(response.headers['content-disposition']).toBe('attachment; filename="landing-page.zip"');
    expect(response.headers['cache-control']).toBe('no-store');

    expect(entryNames(response.rawPayload)).toEqual(
      expect.arrayContaining(['package.json', 'index.html', 'src/main.tsx', 'src/pages/Home.tsx']),
    );
  });

  it('reports how much was left behind, so the studio can say so', async () => {
    const { workspace, owner } = await createWorkspaceWithRoles(api);
    const project = await createProject(api, owner, workspace.id);
    await saveDoc(owner, project.id, makeDoc('NoSuchComponent'));

    const response = await api.get(`/api/projects/${project.id}/export`, { as: owner });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-export-warnings']).toBe('1');
    expect(entryNames(response.rawPayload)).toContain('EXPORT-NOTES.md');
  });

  it('lets a viewer download what they have been shown', async () => {
    const { workspace, owner, viewer } = await createWorkspaceWithRoles(api);
    const project = await createProject(api, owner, workspace.id);
    await saveDoc(owner, project.id, makeDoc());

    const response = await api.get(`/api/projects/${project.id}/export`, { as: viewer });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-export-warnings']).toBe('0');
  });

  it('refuses someone outside the workspace', async () => {
    const { workspace, owner, outsider } = await createWorkspaceWithRoles(api);
    const project = await createProject(api, owner, workspace.id);
    await saveDoc(owner, project.id, makeDoc());

    const response = await api.get(`/api/projects/${project.id}/export`, { as: outsider });

    expect(response.statusCode).toBe(403);
    expect(response.json<ApiErrorResponse>().error.code).toBe('forbidden');
  });

  it('refuses an unauthenticated request', async () => {
    const { workspace, owner } = await createWorkspaceWithRoles(api);
    const project = await createProject(api, owner, workspace.id);
    await saveDoc(owner, project.id, makeDoc());

    const response = await api.get(`/api/projects/${project.id}/export`);

    expect(response.statusCode).toBe(401);
  });

  it('says so when the project has never been saved', async () => {
    const { workspace, owner } = await createWorkspaceWithRoles(api);
    const project = await createProject(api, owner, workspace.id);

    const response = await api.get(`/api/projects/${project.id}/export`, { as: owner });

    expect(response.statusCode).toBe(409);
    expect(response.json<ApiErrorResponse>().error.code).toBe('conflict');
  });
});
