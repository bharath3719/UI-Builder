import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ApiErrorResponse,
  WorkspaceMemberSummary,
  WorkspaceSummary,
} from '@ui-builder/schema';
import { createTestApi, type TestApi } from '../../test/api.js';
import { addMember, createWorkspace, createWorkspaceWithRoles } from '../../test/fixtures.js';

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

describe('POST /api/workspaces', () => {
  it('creates a workspace and makes the creator its owner', async () => {
    const user = await api.register();

    const response = await api.post('/api/workspaces', { as: user, body: { name: 'Acme Inc' } });

    expect(response.statusCode).toBe(201);
    expect(response.json<WorkspaceSummary>()).toMatchObject({
      name: 'Acme Inc',
      slug: 'acme-inc',
      role: 'OWNER',
      projectCount: 0,
    });
  });

  it('requires a signed-in user', async () => {
    const response = await api.post('/api/workspaces', { body: { name: 'Acme' } });

    expect(response.statusCode).toBe(401);
  });

  it('derives a distinct slug when the obvious one is taken', async () => {
    const user = await api.register();

    const first = await createWorkspace(api, user, { name: 'Acme' });
    const second = await createWorkspace(api, user, { name: 'Acme' });

    expect(first.slug).toBe('acme');
    expect(second.slug).toBe('acme-2');
  });

  it('reports a clash instead of renaming when the slug was chosen explicitly', async () => {
    const user = await api.register();
    await createWorkspace(api, user, { name: 'Acme', slug: 'acme' });

    const response = await api.post('/api/workspaces', {
      as: user,
      body: { name: 'Another', slug: 'acme' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<ApiErrorResponse>().error.code).toBe('conflict');
  });

  it('rejects a slug that would collide with a studio route', async () => {
    const user = await api.register();

    const response = await api.post('/api/workspaces', {
      as: user,
      body: { name: 'New', slug: 'new' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.details?.[0]?.path).toBe('body.slug');
  });

  it('falls back to a usable slug when the name has nothing to slug', async () => {
    const user = await api.register();

    const workspace = await createWorkspace(api, user, { name: '🎨' });

    expect(workspace.name).toBe('🎨');
    expect(workspace.slug).toBe('workspace');
  });
});

describe('GET /api/workspaces', () => {
  it('lists only the workspaces the caller belongs to', async () => {
    const { workspace, viewer, outsider } = await createWorkspaceWithRoles(api);
    await createWorkspace(api, outsider, { name: 'Elsewhere' });

    const mine = await api.get('/api/workspaces', { as: viewer });
    const theirs = await api.get('/api/workspaces', { as: outsider });

    expect(mine.json<WorkspaceSummary[]>().map((entry) => entry.id)).toEqual([workspace.id]);
    expect(theirs.json<WorkspaceSummary[]>().map((entry) => entry.name)).toEqual(['Elsewhere']);
  });

  it('reports each caller their own role', async () => {
    const { workspace, owner, editor } = await createWorkspaceWithRoles(api);

    const asOwner = await api.get('/api/workspaces', { as: owner });
    const asEditor = await api.get('/api/workspaces', { as: editor });

    expect(asOwner.json<WorkspaceSummary[]>()[0]).toMatchObject({
      id: workspace.id,
      role: 'OWNER',
    });
    expect(asEditor.json<WorkspaceSummary[]>()[0]).toMatchObject({
      id: workspace.id,
      role: 'EDITOR',
    });
  });
});

describe('GET /api/workspaces/:id', () => {
  it('is readable by every member', async () => {
    const { workspace, viewer } = await createWorkspaceWithRoles(api);

    const response = await api.get(`/api/workspaces/${workspace.id}`, { as: viewer });

    expect(response.statusCode).toBe(200);
    expect(response.json<WorkspaceSummary>()).toMatchObject({ id: workspace.id, role: 'VIEWER' });
  });

  it('is forbidden to a non-member', async () => {
    const { workspace, outsider } = await createWorkspaceWithRoles(api);

    const response = await api.get(`/api/workspaces/${workspace.id}`, { as: outsider });

    expect(response.statusCode).toBe(403);
    expect(response.json<ApiErrorResponse>().error.code).toBe('forbidden');
  });

  it('is 404 when the workspace does not exist at all', async () => {
    const user = await api.register();

    const response = await api.get('/api/workspaces/does-not-exist', { as: user });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiErrorResponse>().error.code).toBe('not_found');
  });
});

describe('PATCH /api/workspaces/:id', () => {
  it('lets an admin rename it', async () => {
    const { workspace, admin } = await createWorkspaceWithRoles(api);

    const response = await api.patch(`/api/workspaces/${workspace.id}`, {
      as: admin,
      body: { name: 'Renamed' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<WorkspaceSummary>().name).toBe('Renamed');
  });

  it('refuses an editor and a viewer', async () => {
    const { workspace, editor, viewer } = await createWorkspaceWithRoles(api);

    for (const user of [editor, viewer]) {
      const response = await api.patch(`/api/workspaces/${workspace.id}`, {
        as: user,
        body: { name: 'Renamed' },
      });

      expect(response.statusCode).toBe(403);
    }
  });

  it('rejects an empty body rather than silently doing nothing', async () => {
    const { workspace, owner } = await createWorkspaceWithRoles(api);

    const response = await api.patch(`/api/workspaces/${workspace.id}`, { as: owner, body: {} });

    expect(response.statusCode).toBe(400);
  });
});

describe('DELETE /api/workspaces/:id', () => {
  it('is owner-only', async () => {
    const { workspace, admin } = await createWorkspaceWithRoles(api);

    const response = await api.delete(`/api/workspaces/${workspace.id}`, { as: admin });

    expect(response.statusCode).toBe(403);
  });

  it('removes the workspace and its memberships', async () => {
    const { workspace, owner, viewer } = await createWorkspaceWithRoles(api);

    const response = await api.delete(`/api/workspaces/${workspace.id}`, { as: owner });
    expect(response.statusCode).toBe(204);

    const stillListed = await api.get('/api/workspaces', { as: viewer });
    expect(stillListed.json<WorkspaceSummary[]>()).toEqual([]);
  });
});

describe('workspace members', () => {
  it('lists everyone, oldest membership first', async () => {
    const { workspace, viewer } = await createWorkspaceWithRoles(api);

    const response = await api.get(`/api/workspaces/${workspace.id}/members`, { as: viewer });

    expect(response.statusCode).toBe(200);
    expect(response.json<WorkspaceMemberSummary[]>().map((member) => member.role)).toEqual([
      'OWNER',
      'ADMIN',
      'EDITOR',
      'VIEWER',
    ]);
  });

  it('refuses to add someone who has no account yet', async () => {
    const { workspace, owner } = await createWorkspaceWithRoles(api);

    const response = await api.post(`/api/workspaces/${workspace.id}/members`, {
      as: owner,
      body: { email: 'nobody@example.test', role: 'EDITOR' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('refuses to add the same person twice', async () => {
    const { workspace, owner, editor } = await createWorkspaceWithRoles(api);

    const response = await api.post(`/api/workspaces/${workspace.id}/members`, {
      as: owner,
      body: { email: editor.email, role: 'VIEWER' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('stops an admin from granting a role above their own', async () => {
    const { workspace, admin, outsider } = await createWorkspaceWithRoles(api);

    const response = await api.post(`/api/workspaces/${workspace.id}/members`, {
      as: admin,
      body: { email: outsider.email, role: 'OWNER' },
    });

    // Otherwise promoting an accomplice to owner would be a one-step escalation.
    expect(response.statusCode).toBe(403);
  });

  it('stops an admin from acting on an owner', async () => {
    const { workspace, admin, owner } = await createWorkspaceWithRoles(api);

    const members = await api.get(`/api/workspaces/${workspace.id}/members`, { as: admin });
    const ownerMember = members
      .json<WorkspaceMemberSummary[]>()
      .find((member) => member.userId === owner.id);

    const demote = await api.patch(`/api/workspaces/${workspace.id}/members/${ownerMember?.id}`, {
      as: admin,
      body: { role: 'VIEWER' },
    });
    const remove = await api.delete(`/api/workspaces/${workspace.id}/members/${ownerMember?.id}`, {
      as: admin,
    });

    expect(demote.statusCode).toBe(403);
    expect(remove.statusCode).toBe(403);
  });

  it('stops anyone from changing their own role', async () => {
    const { workspace, owner } = await createWorkspaceWithRoles(api);

    const members = await api.get(`/api/workspaces/${workspace.id}/members`, { as: owner });
    const self = members.json<WorkspaceMemberSummary[]>().find((m) => m.userId === owner.id);

    const response = await api.patch(`/api/workspaces/${workspace.id}/members/${self?.id}`, {
      as: owner,
      body: { role: 'ADMIN' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('lets an owner promote someone, then hand over and leave', async () => {
    const { workspace, owner, admin } = await createWorkspaceWithRoles(api);

    const members = await api.get(`/api/workspaces/${workspace.id}/members`, { as: owner });
    const list = members.json<WorkspaceMemberSummary[]>();
    const adminMember = list.find((member) => member.userId === admin.id);
    const ownerMember = list.find((member) => member.userId === owner.id);

    const promote = await api.patch(`/api/workspaces/${workspace.id}/members/${adminMember?.id}`, {
      as: owner,
      body: { role: 'OWNER' },
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json<WorkspaceMemberSummary>().role).toBe('OWNER');

    // With a second owner in place, the original may now leave.
    const leave = await api.delete(`/api/workspaces/${workspace.id}/members/${ownerMember?.id}`, {
      as: owner,
    });
    expect(leave.statusCode).toBe(204);
  });

  it('refuses to remove the last owner', async () => {
    const { workspace, owner } = await createWorkspaceWithRoles(api);

    const members = await api.get(`/api/workspaces/${workspace.id}/members`, { as: owner });
    const self = members.json<WorkspaceMemberSummary[]>().find((m) => m.userId === owner.id);

    const response = await api.delete(`/api/workspaces/${workspace.id}/members/${self?.id}`, {
      as: owner,
    });

    // A workspace with no owner could never be deleted or have its roles changed again.
    expect(response.statusCode).toBe(409);
  });

  it('lets a viewer leave of their own accord', async () => {
    const { workspace, viewer } = await createWorkspaceWithRoles(api);

    const members = await api.get(`/api/workspaces/${workspace.id}/members`, { as: viewer });
    const self = members.json<WorkspaceMemberSummary[]>().find((m) => m.userId === viewer.id);

    const response = await api.delete(`/api/workspaces/${workspace.id}/members/${self?.id}`, {
      as: viewer,
    });

    expect(response.statusCode).toBe(204);

    const afterLeaving = await api.get(`/api/workspaces/${workspace.id}`, { as: viewer });
    expect(afterLeaving.statusCode).toBe(403);
  });

  it('will not action a member id belonging to another workspace', async () => {
    const { workspace: theirs, owner: theirOwner, viewer } = await createWorkspaceWithRoles(api);
    const attacker = await api.register();
    const mine = await createWorkspace(api, attacker, { name: 'Mine' });

    const members = await api.get(`/api/workspaces/${theirs.id}/members`, { as: theirOwner });
    const theirViewer = members
      .json<WorkspaceMemberSummary[]>()
      .find((m) => m.userId === viewer.id);

    // Admin rights in one workspace must not reach into another's membership rows.
    const response = await api.delete(`/api/workspaces/${mine.id}/members/${theirViewer?.id}`, {
      as: attacker,
    });

    expect(response.statusCode).toBe(404);
  });

  it('grants the new member exactly the role they were given', async () => {
    const owner = await api.register();
    const invitee = await api.register();
    const workspace = await createWorkspace(api, owner);

    const member = await addMember(api, owner, workspace.id, invitee, 'EDITOR');

    expect(member).toMatchObject({ userId: invitee.id, email: invitee.email, role: 'EDITOR' });

    const listed = await api.get('/api/workspaces', { as: invitee });
    expect(listed.json<WorkspaceSummary[]>()[0]).toMatchObject({ role: 'EDITOR' });
  });
});
