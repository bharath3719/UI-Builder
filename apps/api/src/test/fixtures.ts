import type {
  ProjectSummary,
  Role,
  WorkspaceMemberSummary,
  WorkspaceSummary,
} from '@ui-builder/schema';
import type { TestApi, TestUser } from './api.js';

/**
 * Setup steps used by more than one suite. Each asserts its own success, so a broken
 * precondition fails at the line that caused it rather than as a confusing assertion
 * three steps later.
 */
function expectStatus(what: string, actual: number, expected: number, body: string): void {
  if (actual !== expected) {
    throw new Error(`${what} expected ${expected}, got ${actual}: ${body}`);
  }
}

export async function createWorkspace(
  api: TestApi,
  owner: TestUser,
  body: { name: string; slug?: string } = { name: 'Acme' },
): Promise<WorkspaceSummary> {
  const response = await api.post('/api/workspaces', { as: owner, body });
  expectStatus('createWorkspace', response.statusCode, 201, response.body);
  return response.json<WorkspaceSummary>();
}

/** Adds an existing account to a workspace at the given role. */
export async function addMember(
  api: TestApi,
  actor: TestUser,
  workspaceId: string,
  member: TestUser,
  role: Role,
): Promise<WorkspaceMemberSummary> {
  const response = await api.post(`/api/workspaces/${workspaceId}/members`, {
    as: actor,
    body: { email: member.email, role },
  });
  expectStatus('addMember', response.statusCode, 201, response.body);
  return response.json<WorkspaceMemberSummary>();
}

export async function createProject(
  api: TestApi,
  actor: TestUser,
  workspaceId: string,
  body: { name: string; slug?: string } = { name: 'Landing page' },
): Promise<ProjectSummary> {
  const response = await api.post(`/api/workspaces/${workspaceId}/projects`, { as: actor, body });
  expectStatus('createProject', response.statusCode, 201, response.body);
  return response.json<ProjectSummary>();
}

/**
 * A workspace with one member at each role, which most authorisation tests need.
 * `owner` created it; the rest were added by them.
 */
export async function createWorkspaceWithRoles(api: TestApi): Promise<{
  workspace: WorkspaceSummary;
  owner: TestUser;
  admin: TestUser;
  editor: TestUser;
  viewer: TestUser;
  outsider: TestUser;
}> {
  const [owner, admin, editor, viewer, outsider] = await Promise.all([
    api.register({ name: 'Owner' }),
    api.register({ name: 'Admin' }),
    api.register({ name: 'Editor' }),
    api.register({ name: 'Viewer' }),
    api.register({ name: 'Outsider' }),
  ]);

  const workspace = await createWorkspace(api, owner);

  await addMember(api, owner, workspace.id, admin, 'ADMIN');
  await addMember(api, owner, workspace.id, editor, 'EDITOR');
  await addMember(api, owner, workspace.id, viewer, 'VIEWER');

  return { workspace, owner, admin, editor, viewer, outsider };
}
