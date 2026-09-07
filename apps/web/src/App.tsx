import { Route, Routes, useNavigate } from 'react-router';
import { PreviewRoute } from './preview/PreviewRoute.js';
import { SharedPageRoute } from './preview/SharedPageRoute.js';
import { EditorRoute } from './routes/EditorRoute.js';
import { RequireAuth } from './routes/RequireAuth.js';
import { SignInRoute } from './routes/SignInRoute.js';
import { SignUpRoute } from './routes/SignUpRoute.js';
import { Button } from './ui/Button.js';
import { ScreenMessage } from './ui/Screen.js';
import { WorkspaceIndexRoute } from './workspace/WorkspaceIndexRoute.js';
import { WorkspaceRoute } from './workspace/WorkspaceRoute.js';

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

      <Route element={<RequireAuth />}>
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
