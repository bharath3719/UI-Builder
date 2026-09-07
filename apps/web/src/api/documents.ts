import {
  DocumentResponse,
  RestoreRevisionResponse,
  RevisionDetail,
  RevisionList,
  type RevisionSummary,
  type SaveDocumentRequest,
  SaveDocumentResponse,
} from '@ui-builder/schema';
import { apiRequest } from './client.js';

export function getDocument(projectId: string, signal?: AbortSignal): Promise<DocumentResponse> {
  return apiRequest(DocumentResponse, `/api/projects/${projectId}/document`, {
    ...(signal ? { signal } : {}),
  });
}

export function saveDocument(
  projectId: string,
  input: SaveDocumentRequest,
): Promise<SaveDocumentResponse> {
  return apiRequest(SaveDocumentResponse, `/api/projects/${projectId}/document`, {
    method: 'PUT',
    body: input,
  });
}

export function listRevisions(projectId: string, signal?: AbortSignal): Promise<RevisionSummary[]> {
  return apiRequest(RevisionList, `/api/projects/${projectId}/revisions`, {
    ...(signal ? { signal } : {}),
  });
}

export function getRevision(
  projectId: string,
  revisionId: string,
  signal?: AbortSignal,
): Promise<RevisionDetail> {
  return apiRequest(RevisionDetail, `/api/projects/${projectId}/revisions/${revisionId}`, {
    ...(signal ? { signal } : {}),
  });
}

export function restoreRevision(
  projectId: string,
  revisionId: string,
): Promise<RestoreRevisionResponse> {
  return apiRequest(
    RestoreRevisionResponse,
    `/api/projects/${projectId}/revisions/${revisionId}/restore`,
    { method: 'POST' },
  );
}
