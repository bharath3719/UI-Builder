import { z } from 'zod';
import {
  type AddMemberRequest,
  type CreateWorkspaceRequest,
  type UpdateMemberRequest,
  type UpdateWorkspaceRequest,
  WorkspaceMemberSummary,
  WorkspaceSummary,
} from '@ui-builder/schema';
import { apiRequest, apiRequestVoid } from './client.js';

const WorkspaceList = z.array(WorkspaceSummary);
const MemberList = z.array(WorkspaceMemberSummary);

export function listWorkspaces(signal?: AbortSignal): Promise<WorkspaceSummary[]> {
  return apiRequest(WorkspaceList, '/api/workspaces', { ...(signal ? { signal } : {}) });
}

export function getWorkspace(id: string, signal?: AbortSignal): Promise<WorkspaceSummary> {
  return apiRequest(WorkspaceSummary, `/api/workspaces/${id}`, { ...(signal ? { signal } : {}) });
}

export function createWorkspace(input: CreateWorkspaceRequest): Promise<WorkspaceSummary> {
  return apiRequest(WorkspaceSummary, '/api/workspaces', { method: 'POST', body: input });
}

export function updateWorkspace(
  id: string,
  input: UpdateWorkspaceRequest,
): Promise<WorkspaceSummary> {
  return apiRequest(WorkspaceSummary, `/api/workspaces/${id}`, { method: 'PATCH', body: input });
}

export function deleteWorkspace(id: string): Promise<void> {
  return apiRequestVoid(`/api/workspaces/${id}`, { method: 'DELETE' });
}

export function listMembers(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceMemberSummary[]> {
  return apiRequest(MemberList, `/api/workspaces/${workspaceId}/members`, {
    ...(signal ? { signal } : {}),
  });
}

export function addMember(
  workspaceId: string,
  input: AddMemberRequest,
): Promise<WorkspaceMemberSummary> {
  return apiRequest(WorkspaceMemberSummary, `/api/workspaces/${workspaceId}/members`, {
    method: 'POST',
    body: input,
  });
}

export function updateMemberRole(
  workspaceId: string,
  memberId: string,
  input: UpdateMemberRequest,
): Promise<WorkspaceMemberSummary> {
  return apiRequest(WorkspaceMemberSummary, `/api/workspaces/${workspaceId}/members/${memberId}`, {
    method: 'PATCH',
    body: input,
  });
}

/** Also how a member leaves: pass their own membership id. */
export function removeMember(workspaceId: string, memberId: string): Promise<void> {
  return apiRequestVoid(`/api/workspaces/${workspaceId}/members/${memberId}`, {
    method: 'DELETE',
  });
}
