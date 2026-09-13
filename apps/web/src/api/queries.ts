import {
  QueryClient,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  AddMemberRequest,
  AssetSummary,
  CreateProjectRequest,
  CreateWorkspaceRequest,
  ProjectSummary,
  Role,
  UpdateProjectRequest,
  UpdateWorkspaceRequest,
  WorkspaceSummary,
} from '@ui-builder/schema';
import * as assetsApi from './assets.js';
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
  assets: (projectId: string) => ['projects', projectId, 'assets'] as const,
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
   Assets
   ========================================================================== */

export function useAssets(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.assets(projectId ?? ''),
    queryFn: projectId
      ? ({ signal }: { signal: AbortSignal }) => assetsApi.listAssets(projectId, signal)
      : skipToken,
  });
}

export function useUploadAsset(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => assetsApi.uploadAsset(projectId, file),
    onSuccess: (asset: AssetSummary) => {
      // Prepended rather than invalidated: the list is ordered newest-first and the server
      // just told us the new row, so a refetch would be a round trip to learn what is
      // already in hand — and a picker that flickers between the two orderings.
      client.setQueryData<AssetSummary[]>(keys.assets(projectId), (current) =>
        current ? [asset, ...current] : [asset],
      );
    },
  });
}

export function useDeleteAsset(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (assetId: string) => assetsApi.deleteAsset(projectId, assetId),
    onSuccess: (_result, assetId) => {
      client.setQueryData<AssetSummary[]>(keys.assets(projectId), (current) =>
        current?.filter((asset) => asset.id !== assetId),
      );
    },
  });
}

/* ==========================================================================
   Members
   ========================================================================== */

export function useMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: keys.members(workspaceId ?? ''),
    queryFn: workspaceId
      ? ({ signal }: { signal: AbortSignal }) => workspacesApi.listMembers(workspaceId, signal)
      : skipToken,
  });
}

/**
 * The three writes share one `onSuccess`, because they all change the same two things:
 * the member list, and the `role` the workspace summary carries for the caller.
 *
 * That second one is not incidental. A workspace's own `role` is what every screen reads
 * to decide what to offer — the studio decides whether it is read-only before it renders
 * (Phase 8) — so demoting yourself and leaving the project grid still showing "New
 * project" would be a button that 403s. Invalidating both is what keeps the chrome honest.
 */
function useMemberMutation<TArgs, TResult>(
  workspaceId: string,
  run: (args: TArgs) => Promise<TResult>,
) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.members(workspaceId) });
      void client.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}

export function useAddMember(workspaceId: string) {
  return useMemberMutation(workspaceId, (input: AddMemberRequest) =>
    workspacesApi.addMember(workspaceId, input),
  );
}

export function useUpdateMemberRole(workspaceId: string) {
  return useMemberMutation(workspaceId, ({ memberId, role }: { memberId: string; role: Role }) =>
    workspacesApi.updateMemberRole(workspaceId, memberId, { role }),
  );
}

/**
 * Also how a member leaves: pass their own membership id.
 *
 * `onRemoved` is taken here rather than passed to `mutate`, and that is load-bearing.
 * Leaving a workspace removes it from the caller's list, which makes the screen holding
 * this dialog decide it is looking at a workspace that no longer exists — so the component
 * that called `mutate` is gone by the time the request settles, and TanStack skips the
 * per-call callbacks of an unmounted observer. A mutation-level callback still runs, which
 * is what gets the leaver somewhere that exists rather than onto "workspace not found".
 */
export function useRemoveMember(workspaceId: string, onRemoved?: (memberId: string) => void) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) => workspacesApi.removeMember(workspaceId, memberId),
    onSuccess: async (_result, memberId) => {
      if (onRemoved) {
        // Leaving: the member list has stopped being readable, so refetching it would only
        // produce a 403 to show in the panel that is on its way out. Drop it instead.
        client.removeQueries({ queryKey: keys.members(workspaceId) });
      } else {
        void client.invalidateQueries({ queryKey: keys.members(workspaceId) });
      }

      // Awaited, and *before* the callback, which is the whole of why this is not two
      // `void` calls: `/` redirects into the caller's first workspace, so a leaver sent
      // there while the list still holds the workspace they just left is sent straight
      // back into it — and lands on "workspace not found" a moment later.
      await client.invalidateQueries({ queryKey: keys.workspaces });
      onRemoved?.(memberId);
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
