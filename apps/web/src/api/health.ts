import { HealthResponse } from '@ui-builder/schema';
import { ApiError } from './client.js';

/**
 * Reads /health and validates it against the same zod schema the API builds its
 * response from — so a drift between the two surfaces here rather than silently.
 *
 * This does not go through `apiRequest`, because a degraded API answers 503 with a
 * well-formed body and that is a *successful read*: the status lives in
 * `payload.status`, not in the HTTP code.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response;
  try {
    response = await fetch('/health', { headers: { accept: 'application/json' }, signal });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new ApiError('Could not reach the API server.', 'network_error', null, { cause });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiError(
      `The API responded ${response.status} with a non-JSON body.`,
      'contract_error',
      response.status,
      { cause },
    );
  }

  const parsed = HealthResponse.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      'The API returned a payload that does not match the health contract.',
      'contract_error',
      response.status,
      { cause: parsed.error },
    );
  }

  return parsed.data;
}
