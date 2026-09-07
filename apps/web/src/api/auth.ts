import {
  AuthResponse,
  AuthUser,
  type LoginRequest,
  type RegisterRequest,
} from '@ui-builder/schema';
import { apiRequest, apiRequestVoid, setAccessToken } from './client.js';

/**
 * The three routes that establish a session all return the same body and all set the
 * refresh cookie, so they share one landing: store the access token, hand back the user.
 */
async function establish(path: string, body: unknown): Promise<AuthUser> {
  const session = await apiRequest(AuthResponse, path, {
    method: 'POST',
    body,
    anonymous: true,
  });

  setAccessToken(session.accessToken);
  return session.user;
}

export function register(input: RegisterRequest): Promise<AuthUser> {
  return establish('/api/auth/register', input);
}

export function login(input: LoginRequest): Promise<AuthUser> {
  return establish('/api/auth/login', input);
}

/**
 * Clears the refresh cookie server-side. Deliberately not `anonymous`: sending the
 * access token lets the server tie the sign-out to a session in its log. It is also
 * the one mutation whose failure the caller should ignore — see `useLogout`.
 */
export function logout(): Promise<void> {
  return apiRequestVoid('/api/auth/logout', { method: 'POST' });
}

export function fetchMe(signal?: AbortSignal): Promise<AuthUser> {
  return apiRequest(AuthUser, '/api/auth/me', { ...(signal ? { signal } : {}) });
}
