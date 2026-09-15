import { Suspense, lazy } from 'react';
import { Route, Routes, useNavigate } from 'react-router';
import { SharedPageRoute } from './preview/SharedPageRoute.js';
import { RequireAuth } from './routes/RequireAuth.js';
import { SignInRoute } from './routes/SignInRoute.js';
import { SignUpRoute } from './routes/SignUpRoute.js';
import { Button } from './ui/Button.js';
import { ScreenLoading, ScreenMessage } from './ui/Screen.js';

/**
 * The studio, split off from the routes that do not need it.
 *
 * The editor is most of this bundle — the canvas, the drag-and-drop, the inspector, the
 * component library, and through the code dialog the generator as well. Three of the
 * routes below have no use for any of it, and one of those three is the one strangers
 * reach: a `/s/:slug` visitor was downloading the whole builder to look at one static
 * page, because a single chunk is a single chunk no matter which route asked for it.
 *
 * Sign-in, sign-up and the shared page stay eager. They are the three entry points where a
 * second round trip before first paint would be the most visible, and between them they
 * pull almost nothing — the shared page renders through `@ui-builder/runtime`, which is
 * what draws a document, not what edits one.
 */
const EditorRoute = lazy(async () => ({
  default: (await import('./routes/EditorRoute.js')).EditorRoute,
}));
const PreviewRoute = lazy(async () => ({
  default: (await import('./preview/PreviewRoute.js')).PreviewRoute,
}));
const WorkspaceIndexRoute = lazy(async () => ({
  default: (await import('./workspace/WorkspaceIndexRoute.js')).WorkspaceIndexRoute,
}));
const WorkspaceRoute = lazy(async () => ({
  default: (await import('./workspace/WorkspaceRoute.js')).WorkspaceRoute,
}));

function NotFoundRoute() {
  const navigate = useNavigate();

  return (
    <ScreenMessage
      title="Page not found"
      message="That address does not lead anywhere in the studio."
      actions={<Button onClick={() => void navigate('/')}>Go to your workspaces</Button>}
    />
  );
}

/**
 * Route table.
 *
 * Everything behind `RequireAuth` shares one gate, so a new authenticated screen is a
 * line here and nothing else — and there is exactly one place that decides what an
 * unrestored session should do (see `RequireAuth`).
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<SignInRoute />} />
      <Route path="/signup" element={<SignUpRoute />} />

      {/* A shared page. Public on purpose — the slug is the credential, and a link that
          asked a visitor to sign in would not be a shared link (Phase 9). */}
      <Route path="/s/:slug" element={<SharedPageRoute />} />

      {/* One boundary around the whole authenticated group rather than one per route: the
          chunk is shared between them, so after the first of these screens no other one
          suspends, and a fallback per route would only be four places to keep identical. */}
      <Route
        element={
          <Suspense fallback={<ScreenLoading label="Loading the studio" />}>
            <RequireAuth />
          </Suspense>
        }
      >
        <Route path="/" element={<WorkspaceIndexRoute />} />
        <Route path="/w/:workspaceSlug" element={<WorkspaceRoute />} />
        <Route path="/p/:projectId" element={<EditorRoute />} />
        {/* The page id is optional: a preview of "the project" is a reasonable thing to
            link to, and it resolves to the first page. */}
        <Route path="/preview/:projectId" element={<PreviewRoute />} />
        <Route path="/preview/:projectId/:pageId" element={<PreviewRoute />} />
      </Route>

      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}
