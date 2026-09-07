import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@ui-builder/schema';
import { logout as logoutRequest } from '../api/auth.js';
import { onSessionLost, refreshSession, setAccessToken } from '../api/client.js';
import { AuthContext, type AuthState } from './context.js';

/**
 * Owns "who is signed in".
 *
 * The access token lives in memory (see `api/client.ts`), so a page load starts with no
 * credentials at all and has to ask: the httpOnly refresh cookie is the only thing that
 * survived. Until that question is answered `user` is `undefined` — distinct from `null`,
 * which means asked and answered "nobody". Route guards must not confuse the two, or a
 * reload inside the editor would bounce the user to sign-in every time.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    void refreshSession().then((session) => {
      if (!cancelled) setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // A rejected refresh mid-session (revoked token, expired cookie) has to reach React
  // from inside the fetch layer, which has no way to call a setState of its own.
  useEffect(
    () =>
      onSessionLost(() => {
        setUser(null);
        queryClient.clear();
      }),
    [queryClient],
  );

  const signedIn = useCallback(
    (next: AuthUser) => {
      // Anything cached belongs to whoever was signed in a moment ago.
      queryClient.clear();
      setUser(next);
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // The cookie may already be gone or the server unreachable. Either way the local
      // session ends: failing to sign out is not something to make the user retry.
    }

    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({ user, isRestoring: user === undefined, signedIn, signOut }),
    [user, signedIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
