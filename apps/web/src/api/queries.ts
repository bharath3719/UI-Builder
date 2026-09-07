import {
  QueryClient,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreateProjectRequest,
  CreateWorkspaceRequest,
  ProjectSummary,
  UpdateProjectRequest,
  UpdateWorkspaceRequest,
  WorkspaceSummary,
} from '@ui-builder/schema';
import { ApiError } from './client.js';
import * as projectsApi from './projects.js';
import * as workspacesApi from './workspaces.js';

/**
 * Every key in one place. Keys are hierarchical so invalidating `['workspaces']` also
 * drops the per-workspace entries under it — which is what "I just renamed a workspace"
 * actually means.
 */
export const keys = {
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspaces', id] as const,
  members: (id: string) => ['workspaces', id, 'members'] as const,
  projects: (workspaceId: string, includeArchived: boolean) =>
    ['workspaces', workspaceId, 'projects', { includeArchived }] as const,
  project: (id: string) => ['projects', id] as const,
  revisions: (id: string) => ['projects', id, 'revisions'] as const,
  /**
   * The saved document. Read by the preview, which is a viewer over what the server holds
   * — the studio's own copy is owned by `usePersistence`, deliberately outside this cache
   * (a write loop is not a query).
   */
  document: (id: string) => ['projects', id, 'document'] as const,
  publish: (id: string) => ['projects', id, 'publish'] as const,
  /** Keyed by slug alone: a shared page has no project id to hang off. */
  published: (slug: string) => ['published', slug] as const,
};

/**
 * Retrying a 4xx is pointless — the request will be just as forbidden the second time —
 * and it delays the screen that has to explain the problem. Only server-side and
 * network failures are worth another go.
 */
function retryServerFailuresOnly(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status !== null && error.status < 500) {
    return false;
  }
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: retryServerFailuresOnly,
        // Panels remount constantly as the user moves around the studio; refetching on
        // every mount would put the project grid into a spinner far too often.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

/* ==========================================================================
   Workspaces
   ========================================================================== */

export function useWorkspaces() {
  return useQuery({
    queryKey: keys.workspaces,
    queryFn: ({ signal }) => workspacesApi.listWorkspaces(signal),
  });
}

/**
 * `skipToken` rather than `enabled: false`: it keeps the query function out of the
 * types entirely while the id is unknown, so there is nothing to assert away.
 */
export function useWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: keys.workspace(id ?? ''),
    queryFn: id
      ? ({ signal }: { signal: AbortSignal }) => workspacesApi.getWorkspace(id, signal)
      : skipToken,
  });
}

export function useCreateWorkspace() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWorkspaceRequest) => workspacesApi.createWorkspace(input),
    onSuccess: (workspace: WorkspaceSummary) => {
      client.setQueryData(keys.workspace(workspace.id), workspace);
      void client.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}

export function useUpdateWorkspace(id: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateWorkspaceRequest) => workspacesApi.updateWorkspace(id, input),
    onSuccess: (workspace: WorkspaceSummary) => {
      client.setQueryData(keys.workspace(workspace.id), workspace);
      void client.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}

/* ==========================================================================
   Projects
   ========================================================================== */

export function useProjects(workspaceId: string | undefined, includeArchived = false) {
  return useQuery({
    queryKey: keys.projects(workspaceId ?? '', includeArchived),
    queryFn: workspaceId
      ? ({ signal }: { signal: AbortSignal }) =>
          projectsApi.listProjects(workspaceId, { includeArchived, signal })
      : skipToken,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: keys.project(id ?? ''),
    queryFn: id
      ? ({ signal }: { signal: AbortSignal }) => projectsApi.getProject(id, signal)
      : skipToken,
  });
}

export function useCreateProject(workspaceId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProjectRequest) => projectsApi.createProject(workspaceId, input),
    onSuccess: (project: ProjectSummary) => {
      client.setQueryData(keys.project(project.id), project);
      // The workspace's projectCount moved too, so the list of workspaces is stale.
      void client.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}

export function useUpdateProject(project: ProjectSummary) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProjectRequest) => projectsApi.updateProject(project.id, input),
    onSuccess: (updated: ProjectSummary) => {
      client.setQueryData(keys.project(updated.id), updated);
      void client.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}

export function useDeleteProject(project: ProjectSummary) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => projectsApi.deleteProject(project.id),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.project(project.id) });
      void client.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}
