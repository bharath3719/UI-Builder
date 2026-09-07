import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/context.js';
import { ScreenLoading } from '../ui/Screen.js';

/**
 * Gate for every route that needs a signed-in user.
 *
 * The `isRestoring` branch is the load-bearing one: on a page load the access token is
 * gone and the refresh request has not answered yet. Treating that moment as "signed
 * out" would redirect to sign-in on every refresh, including from inside the editor.
 */
export function RequireAuth() {
  const { user, isRestoring } = useAuth();
  const location = useLocation();

  if (isRestoring) {
    return <ScreenLoading label="Restoring your session" />;
  }

  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }

  return <Outlet />;
}
