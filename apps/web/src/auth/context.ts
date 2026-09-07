import { createContext, use } from 'react';
import type { AuthUser } from '@ui-builder/schema';

export interface AuthState {
  /** `undefined` while the session is still being restored; `null` when signed out. */
  user: AuthUser | null | undefined;
  /** True until the first refresh attempt settles, so guards can wait instead of redirecting. */
  isRestoring: boolean;
  /** Called by the sign-in and sign-up screens once the API has established a session. */
  signedIn: (user: AuthUser) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const state = use(AuthContext);

  if (!state) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }

  return state;
}
