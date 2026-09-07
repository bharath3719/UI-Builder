import { useNavigate, useParams } from 'react-router';
import { useProject, useWorkspaces } from '../api/queries.js';
import { ApiError } from '../api/client.js';
import { formErrorMessage } from '../lib/formErrors.js';
import { StudioLayout } from '../studio/StudioLayout.js';
import { Button } from '../ui/Button.js';
import { ScreenLoading, ScreenMessage } from '../ui/Screen.js';

export function EditorRoute() {
  const { projectId } = useParams();
  const project = useProject(projectId);
  const workspaces = useWorkspaces();
  const navigate = useNavigate();

  if (project.isPending) {
    return <ScreenLoading label="Opening project" />;
  }

  if (project.isError) {
    // 404 and 403 are the two expected ways to land here with a bad id — a stale
    // bookmark, or a project in a workspace this account has since left. Neither is
    // worth a "try again" button; both want a way back.
    const missing =
      project.error instanceof ApiError &&
      (project.error.code === 'not_found' || project.error.code === 'forbidden');

    return (
      <ScreenMessage
        title={missing ? 'Project not available' : 'Could not open this project'}
        message={formErrorMessage(project.error)}
        actions={
          missing ? (
            <Button onClick={() => void navigate('/')}>Back to projects</Button>
          ) : (
            <Button onClick={() => void project.refetch()}>Try again</Button>
          )
        }
      />
    );
  }

  // The workspace is only for the top bar's name and back link, so a slow or failed
  // workspace list must not hold up the editor.
  const workspace = workspaces.data?.find((candidate) => candidate.id === project.data.workspaceId);

  return <StudioLayout project={project.data} workspace={workspace} />;
}
