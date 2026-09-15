import { z } from 'zod';
import { AssetSummary } from '@ui-builder/schema';
import { apiRequest, apiRequestVoid } from './client.js';

const AssetList = z.array(AssetSummary);

export function listAssets(projectId: string, signal?: AbortSignal): Promise<AssetSummary[]> {
  return apiRequest(AssetList, `/api/projects/${projectId}/assets`, {
    ...(signal ? { signal } : {}),
  });
}

/**
 * Uploads one file.
 *
 * `FormData` rather than base64 in a JSON body: base64 is a third larger, is held in
 * memory twice on the way out, and would make the size limit the user was shown mean
 * something different from the size of the file on their disk.
 */
export function uploadAsset(projectId: string, file: File): Promise<AssetSummary> {
  const body = new FormData();
  body.append('file', file);

  return apiRequest(AssetSummary, `/api/projects/${projectId}/assets`, {
    method: 'POST',
    body,
  });
}

export function deleteAsset(projectId: string, assetId: string): Promise<void> {
  return apiRequestVoid(`/api/projects/${projectId}/assets/${assetId}`, { method: 'DELETE' });
}
