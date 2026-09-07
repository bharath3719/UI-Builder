import { PublishStateResponse, PublishSummary, PublishedPageResponse } from '@ui-builder/schema';
import { apiRequest, apiRequestVoid } from './client.js';

export function getPublishState(
  projectId: string,
  signal?: AbortSignal,
): Promise<PublishStateResponse> {
  return apiRequest(PublishStateResponse, `/api/projects/${projectId}/publish`, {
    ...(signal ? { signal } : {}),
  });
}

/** Publishes the project's current revision, or moves an existing link forward to it. */
export function publishProject(projectId: string): Promise<PublishSummary> {
  return apiRequest(PublishSummary, `/api/projects/${projectId}/publish`, { method: 'POST' });
}

export function unpublishProject(projectId: string): Promise<void> {
  return apiRequestVoid(`/api/projects/${projectId}/publish`, { method: 'DELETE' });
}

/**
 * Resolves a shared link.
 *
 * `anonymous` for both halves of what it means: no bearer token is sent, and a 401 is not
 * retried behind a session refresh. The slug is the whole credential, and a visitor
 * following a link has no reason to be asked about an account — including the signed-in
 * visitor, whose session is irrelevant to what this returns.
 */
export function getPublishedPage(
  slug: string,
  signal?: AbortSignal,
): Promise<PublishedPageResponse> {
  return apiRequest(PublishedPageResponse, `/api/published/${encodeURIComponent(slug)}`, {
    anonymous: true,
    ...(signal ? { signal } : {}),
  });
}
