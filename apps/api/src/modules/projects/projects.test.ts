import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorResponse, ProjectSummary } from '@ui-builder/schema';
import { createTestApi, type TestApi } from '../../test/api.js';
import { createProject, createWorkspace, createWorkspaceWithRoles } from '../../test/fixtures.js';

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
 * PLAN.md §12, Phase 1: "an integration test suite registers a user, creates a
 * workspace, creates a project, and a second user gets 403 on it."
 *
 * Written as one continuous scenario rather than split across the suites below, because
 * what is being asserted is that the whole path holds together end to end.
 */
describe('Phase 1 acceptance', () => {
  it('walks register → workspace → project, and keeps a second user out', async () => {
    const alice = await api.register({ name: 'Alice' });

    const workspaceResponse = await api.post('/api/workspaces', {
      as: alice,
      body: { name: 'Alice Design' },
    });
    expect(workspaceResponse.statusCode).toBe(201);
    const workspace = workspaceResponse.json<{ id: string }>();

    const projectResponse = await api.post(`/api/workspaces/${workspace.id}/projects`, {
      as: alice,
      body: { name: 'Marketing site' },
    });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json<ProjectSummary>();
    expect(project).toMatchObject({ name: 'Marketing site', slug: 'marketing-site', version: 0 });

    // A second, unrelated account.
    const bob = await api.register({ name: 'Bob' });

    const read = await api.get(`/api/projects/${project.id}`, { as: bob });
    const update = await api.patch(`/api/projects/${project.id}`, {
      as: bob,
      body: { name: 'Hijacked' },
    });
    const remove = await api.delete(`/api/projects/${project.id}`, { as: bob });
    const list = await api.get(`/api/workspaces/${workspace.id}/projects`, { as: bob });

    for (const response of [read, update, remove, list]) {
      expect(response.statusCode).toBe(403);
      expect(response.json<ApiErrorResponse>().error.code).toBe('forbidden');
    }

    // And the project is untouched.
    const stillThere = await api.get(`/api/projects/${project.id}`, { as: alice });
    expect(stillThere.json<ProjectSummary>().name).toBe('Marketing site');
  });
});

describe('POST /api/workspaces/:id/projects', () => {
  it('needs the editor role', async () => {
    const { workspace, editor, viewer } = await createWorkspaceWithRoles(api);

    const asEditor = await api.post(`/api/workspaces/${workspace.id}/projects`, {
      as: editor,
      body: { name: 'Editor project' },
    });
    const asViewer = await api.post(`/api/workspaces/${workspace.id}/projects`, {
      as: viewer,
      body: { name: 'Viewer project' },
    });

    expect(asEditor.statusCode).toBe(201);
    expect(asViewer.statusCode).toBe(403);
  });

  it('starts at version 0 with no saved document', async () => {
    const owner = await api.register();
    const workspace = await createWorkspace(api, owner);

    const project = await createProject(api, owner, workspace.id);

    // Phase 3 defines the document; Phase 8 starts writing revisions.
    expect(project.version).toBe(0);
    expect(project.archivedAt).toBeNull();
    expect(project.thumbnailUrl).toBeNull();
  });

  it('scopes slug uniqueness to the workspace', async () => {
    const owner = await api.register();
    const first = await createWorkspace(api, owner, { name: 'First' });
    const second = await createWorkspace(api, owner, { name: 'Second' });

    const here = await createProject(api, owner, first.id, { name: 'Landing' });
    const there = await createProject(api, owner, second.id, { name: 'Landing' });

    // Two teams may each have a project called "landing"; only a clash inside one
    // workspace has to be resolved.
    expect(here.slug).toBe('landing');
    expect(there.slug).toBe('landing');

    const duplicate = await createProject(api, owner, first.id, { name: 'Landing' });
    expect(duplicate.slug).toBe('landing-2');
  });

  it('reports a clash on an explicitly chosen slug', async () => {
    const owner = await api.register();
    const workspace = await createWorkspace(api, owner);
    await createProject(api, owner, workspace.id, { name: 'Landing', slug: 'landing' });

    const response = await api.post(`/api/workspaces/${workspace.id}/projects`, {
      as: owner,
      body: { name: 'Other', slug: 'landing' },
    });

    expect(response.statusCode).toBe(409);
  });
});

describe('GET /api/workspaces/:id/projects', () => {
  it('returns only that workspace’s projects, most recently updated first', async () => {
    const owner = await api.register();
    const workspace = await createWorkspace(api, owner, { name: 'Main' });
    const other = await createWorkspace(api, owner, { name: 'Other' });

    const first = await createProject(api, owner, workspace.id, { name: 'First' });
    const second = await createProject(api, owner, workspace.id, { name: 'Second' });
    await createProject(api, owner, other.id, { name: 'Elsewhere' });

    const response = await api.get(`/api/workspaces/${workspace.id}/projects`, { as: owner });

    expect(response.json<ProjectSummary[]>().map((project) => project.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it('hides archived projects unless they are asked for', async () => {
    const owner = await api.register();
    const workspace = await createWorkspace(api, owner);
    const kept = await createProject(api, owner, workspace.id, { name: 'Kept' });
    const shelved = await createProject(api, owner, workspace.id, { name: 'Shelved' });

    await api.patch(`/api/projects/${shelved.id}`, { as: owner, body: { archived: true } });

    const byDefault = await api.get(`/api/workspaces/${workspace.id}/projects`, { as: owner });
    const withArchived = await api.get(
      `/api/workspaces/${workspace.id}/projects?includeArchived=true`,
      { as: owner },
    );

    expect(byDefault.json<ProjectSummary[]>().map((p) => p.id)).toEqual([kept.id]);
    expect(withArchived.json<ProjectSummary[]>()).toHaveLength(2);
  });

  it('does not count archived projects in the workspace summary', async () => {
    const owner = await api.register();
    const workspace = await createWorkspace(api, owner);
    const project = await createProject(api, owner, workspace.id);

    await api.patch(`/api/projects/${project.id}`, { as: owner, body: { archived: true } });

    const response = await api.get(`/api/workspaces/${workspace.id}`, { as: owner });
    expect(response.json<{ projectCount: number }>().projectCount).toBe(0);
  });
});

describe('PATCH /api/projects/:id', () => {
  it('renames, archives and restores', async () => {
    const owner = await api.register();
    const workspace = await createWorkspace(api, owner);
    const project = await createProject(api, owner, workspace.id);

    const renamed = await api.patch(`/api/projects/${project.id}`, {
      as: owner,
      body: { name: 'Renamed' },
    });
    expect(renamed.json<ProjectSummary>().name).toBe('Renamed');

    const archived = await api.patch(`/api/projects/${project.id}`, {
      as: owner,
      body: { archived: true },
    });
    expect(archived.json<ProjectSummary>().archivedAt).toBeTypeOf('string');

    const restored = await api.patch(`/api/projects/${project.id}`, {
      as: owner,
      body: { archived: false },
    });
    expect(restored.json<ProjectSummary>().archivedAt).toBeNull();
  });

  it('needs the editor role', async () => {
    const { workspace, owner, editor, viewer } = await createWorkspaceWithRoles(api);
    const project = await createProject(api, owner, workspace.id);

    const asEditor = await api.patch(`/api/projects/${project.id}`, {
      as: editor,
      body: { name: 'Fine' },
    });
    const asViewer = await api.patch(`/api/projects/${project.id}`, {
      as: viewer,
      body: { name: 'Not fine' },
    });

    expect(asEditor.statusCode).toBe(200);
    expect(asViewer.statusCode).toBe(403);
  });
});

describe('DELETE /api/projects/:id', () => {
  it('needs the admin role, not merely editor', async () => {
    const { workspace, owner, admin, editor } = await createWorkspaceWithRoles(api);
    const first = await createProject(api, owner, workspace.id, { name: 'First' });
    const second = await createProject(api, owner, workspace.id, { name: 'Second' });

    const asEditor = await api.delete(`/api/projects/${first.id}`, { as: editor });
    const asAdmin = await api.delete(`/api/projects/${second.id}`, { as: admin });

    expect(asEditor.statusCode).toBe(403);
    expect(asAdmin.statusCode).toBe(204);
  });

  it('is gone afterwards', async () => {
    const owner = await api.register();
    const workspace = await createWorkspace(api, owner);
    const project = await createProject(api, owner, workspace.id);

    await api.delete(`/api/projects/${project.id}`, { as: owner });

    const response = await api.get(`/api/projects/${project.id}`, { as: owner });
    expect(response.statusCode).toBe(404);
  });
});

describe('project access', () => {
  it('is 404 for an id that does not exist, for anyone', async () => {
    const user = await api.register();

    const response = await api.get('/api/projects/does-not-exist', { as: user });

    expect(response.statusCode).toBe(404);
  });

  it('requires a signed-in user before it considers the role at all', async () => {
    const owner = await api.register();
    const workspace = await createWorkspace(api, owner);
    const project = await createProject(api, owner, workspace.id);

    const response = await api.get(`/api/projects/${project.id}`);

    expect(response.statusCode).toBe(401);
  });

  it('goes away with the workspace it belonged to', async () => {
    const owner = await api.register();
    const workspace = await createWorkspace(api, owner);
    const project = await createProject(api, owner, workspace.id);

    await api.delete(`/api/workspaces/${workspace.id}`, { as: owner });

    // The cascade is declared in schema.prisma; this is what proves it is real.
    const response = await api.get(`/api/projects/${project.id}`, { as: owner });
    expect(response.statusCode).toBe(404);
  });
});
