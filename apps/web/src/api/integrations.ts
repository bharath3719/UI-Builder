import { z } from 'zod';
import {
  ApiEndpointSummary,
  ApiIntegrationSecret,
  ApiIntegrationSummary,
  TestApiEndpointResponse,
  type CreateApiEndpointInput,
  type CreateApiIntegrationInput,
  type TestApiEndpointInput,
  type UpdateApiEndpointRequest,
  type UpdateApiIntegrationRequest,
} from '@ui-builder/schema';
import { apiRequest, apiRequestVoid } from './client.js';

const IntegrationList = z.array(ApiIntegrationSummary);

function base(workspaceId: string): string {
  return `/api/workspaces/${workspaceId}/integrations`;
}

export function listIntegrations(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<ApiIntegrationSummary[]> {
  return apiRequest(IntegrationList, base(workspaceId), { ...(signal ? { signal } : {}) });
}

export function createIntegration(
  workspaceId: string,
  input: CreateApiIntegrationInput,
): Promise<ApiIntegrationSummary> {
  return apiRequest(ApiIntegrationSummary, base(workspaceId), { method: 'POST', body: input });
}

export function updateIntegration(
  workspaceId: string,
  integrationId: string,
  input: UpdateApiIntegrationRequest,
): Promise<ApiIntegrationSummary> {
  return apiRequest(ApiIntegrationSummary, `${base(workspaceId)}/${integrationId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteIntegration(workspaceId: string, integrationId: string): Promise<void> {
  return apiRequestVoid(`${base(workspaceId)}/${integrationId}`, { method: 'DELETE' });
}

/**
 * Deliberately not wrapped in a TanStack query hook.
 *
 * A credential is not cache material: it should live for the duration of the request that
 * needs it and no longer, and a query cache is a long-lived store that a devtools panel
 * will happily print. The canvas calls this directly when a query is about to run.
 */
export function readIntegrationSecret(
  workspaceId: string,
  integrationId: string,
  signal?: AbortSignal,
): Promise<ApiIntegrationSecret> {
  return apiRequest(ApiIntegrationSecret, `${base(workspaceId)}/${integrationId}/secret`, {
    ...(signal ? { signal } : {}),
  });
}

export function createEndpoint(
  workspaceId: string,
  integrationId: string,
  input: CreateApiEndpointInput,
): Promise<ApiEndpointSummary> {
  return apiRequest(ApiEndpointSummary, `${base(workspaceId)}/${integrationId}/endpoints`, {
    method: 'POST',
    body: input,
  });
}

export function updateEndpoint(
  workspaceId: string,
  integrationId: string,
  endpointId: string,
  input: UpdateApiEndpointRequest,
): Promise<ApiEndpointSummary> {
  return apiRequest(
    ApiEndpointSummary,
    `${base(workspaceId)}/${integrationId}/endpoints/${endpointId}`,
    { method: 'PATCH', body: input },
  );
}

export function deleteEndpoint(
  workspaceId: string,
  integrationId: string,
  endpointId: string,
): Promise<void> {
  return apiRequestVoid(`${base(workspaceId)}/${integrationId}/endpoints/${endpointId}`, {
    method: 'DELETE',
  });
}

export function testEndpoint(
  workspaceId: string,
  integrationId: string,
  endpointId: string,
  input: TestApiEndpointInput,
): Promise<TestApiEndpointResponse> {
  return apiRequest(
    TestApiEndpointResponse,
    `${base(workspaceId)}/${integrationId}/endpoints/${endpointId}/test`,
    { method: 'POST', body: input },
  );
}
