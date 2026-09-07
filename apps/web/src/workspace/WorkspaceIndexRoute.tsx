import { useState } from 'react';
import { Navigate } from 'react-router';
import { useWorkspaces } from '../api/queries.js';
import { formErrorMessage } from '../lib/formErrors.js';
import { AppBar } from '../shell/AppBar.js';
import { Button } from '../ui/Button.js';
import { ScreenLoading, ScreenMessage } from '../ui/Screen.js';
import { NewWorkspaceDialog } from './NewWorkspaceDialog.js';
import styles from './WorkspaceRoute.module.css';

/**
 * `/` — the entry point after signing in.
 *
 * Almost always a redirect into a workspace; the only reason it renders anything is the
 * account that has none yet, which is every account on its first visit. That case gets
 * its own screen rather than an empty project grid, because there is nothing to grid.
 */
export function WorkspaceIndexRoute() {
  const workspaces = useWorkspaces();
  const [creating, setCreating] = useState(false);

  if (workspaces.isPending) {
    return <ScreenLoading label="Loading workspaces" />;
  }

  if (workspaces.isError) {
    return (
      <ScreenMessage
        title="Could not load your workspaces"
        message={formErrorMessage(workspaces.error)}
        actions={<Button onClick={() => void workspaces.refetch()}>Try again</Button>}
      />
    );
  }

  const first = workspaces.data.at(0);
  if (first) {
    return <Navigate to={`/w/${first.slug}`} replace />;
  }

  return (
    <div className={styles.page}>
      <AppBar />

      <div className={styles.scroll}>
        <div className={styles.content}>
          <div className={styles.empty}>
            <span className={styles.emptyTitle}>Create your first workspace</span>
            <p className={styles.emptyMessage}>
              A workspace holds your projects and the people who can edit them. You can make more
              later — one per client or product is a common split.
            </p>
            <Button variant="primary" onClick={() => setCreating(true)}>
              New workspace
            </Button>
          </div>
        </div>
      </div>

      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
