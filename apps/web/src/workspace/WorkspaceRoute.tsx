import { useState } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { hasAtLeast, REQUIRES } from '@ui-builder/schema';
import { keys, useProjects, useWorkspaces } from '../api/queries.js';
import { formErrorMessage } from '../lib/formErrors.js';
import { AppBar } from '../shell/AppBar.js';
import { Button } from '../ui/Button.js';
import { ScreenLoading, ScreenMessage } from '../ui/Screen.js';
import { Spinner } from '../ui/Spinner.js';
import { NewProjectDialog } from './NewProjectDialog.js';
import { ProjectCard } from './ProjectCard.js';
import styles from './WorkspaceRoute.module.css';

/**
 * A workspace and its projects.
 *
 * The URL carries the slug, not the id, so the address bar is readable and shareable —
 * which is what `RESERVED_SLUGS` in the contract exists to protect. Resolution happens
 * against the workspace list rather than a lookup route: the switcher needs that list
 * loaded anyway, so this costs nothing.
 */
export function WorkspaceRoute() {
  const { workspaceSlug } = useParams();
  const workspaces = useWorkspaces();
  const queryClient = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const workspace = workspaces.data?.find((candidate) => candidate.slug === workspaceSlug);
  const projects = useProjects(workspace?.id, showArchived);

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

  if (!workspace) {
    return (
      <ScreenMessage
        title="Workspace not found"
        message={`Nothing here is called “${workspaceSlug ?? ''}”, or you are no longer a member of it.`}
      />
    );
  }

  const canCreate = hasAtLeast(workspace.role, REQUIRES.projectWrite);
  // Archiving or deleting changes what this list should contain, and the summary counts
  // on the workspace itself; both hang off the same key prefix.
  const refreshProjects = () => {
    void queryClient.invalidateQueries({ queryKey: keys.workspaces });
  };

  return (
    <div className={styles.page}>
      <AppBar workspace={workspace} />

      <div className={styles.scroll}>
        <div className={styles.content}>
          <header className={styles.header}>
            <div className={styles.heading}>
              <h1 className={styles.title}>Projects</h1>
              <p className={styles.subtitle}>
                {workspace.name} ·{' '}
                {workspace.projectCount === 1 ? '1 project' : `${workspace.projectCount} projects`}
              </p>
            </div>

            <div className={styles.headerActions}>
              <Button
                variant="ghost"
                onClick={() => setShowArchived((shown) => !shown)}
                aria-pressed={showArchived}
              >
                {showArchived ? 'Hide archived' : 'Show archived'}
              </Button>

              {canCreate && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus size={14} aria-hidden="true" />
                  New project
                </Button>
              )}
            </div>
          </header>

          {projects.isPending ? (
            <div className={styles.loading}>
              <Spinner size={18} label="Loading projects" />
            </div>
          ) : projects.isError ? (
            <p className={styles.failure} role="alert">
              {formErrorMessage(projects.error)}
            </p>
          ) : projects.data.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyTitle}>No projects yet</span>
              <p className={styles.emptyMessage}>
                {canCreate
                  ? 'A project is one site or app — its pages, components and theme.'
                  : 'Ask a workspace admin for editor access to create one.'}
              </p>
              {canCreate && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  New project
                </Button>
              )}
            </div>
          ) : (
            <div className={styles.grid}>
              {projects.data.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  role={workspace.role}
                  onChanged={refreshProjects}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <NewProjectDialog workspaceId={workspace.id} open={creating} onOpenChange={setCreating} />
    </div>
  );
}
