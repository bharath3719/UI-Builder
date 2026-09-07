import { z } from 'zod';
import {
  type CreateProjectRequest,
  ProjectSummary,
  type UpdateProjectRequest,
} from '@ui-builder/schema';
import { apiRequest, apiRequestVoid } from './client.js';

const ProjectList = z.array(ProjectSummary);

export function listProjects(
  workspaceId: string,
  options: { includeArchived?: boolean; signal?: AbortSignal } = {},
): Promise<ProjectSummary[]> {
  const query = options.includeArchived ? '?includeArchived=true' : '';

  return apiRequest(ProjectList, `/api/workspaces/${workspaceId}/projects${query}`, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function getProject(id: string, signal?: AbortSignal): Promise<ProjectSummary> {
  return apiRequest(ProjectSummary, `/api/projects/${id}`, { ...(signal ? { signal } : {}) });
}

export function createProject(
  workspaceId: string,
  input: CreateProjectRequest,
): Promise<ProjectSummary> {
  return apiRequest(ProjectSummary, `/api/workspaces/${workspaceId}/projects`, {
    method: 'POST',
    body: input,
  });
}

export function updateProject(id: string, input: UpdateProjectRequest): Promise<ProjectSummary> {
  return apiRequest(ProjectSummary, `/api/projects/${id}`, { method: 'PATCH', body: input });
}

export function deleteProject(id: string): Promise<void> {
  return apiRequestVoid(`/api/projects/${id}`, { method: 'DELETE' });
}
