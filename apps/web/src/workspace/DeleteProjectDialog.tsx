import type { ProjectSummary } from '@ui-builder/schema';
import { useDeleteProject } from '../api/queries.js';
import { formErrorMessage } from '../lib/formErrors.js';
import { Button } from '../ui/Button.js';
import { Dialog, DialogClose, FormError } from '../ui/Dialog.js';

/**
 * Confirms deleting a project outright.
 *
 * No "type the name to confirm" ceremony: archiving is offered right alongside this in
 * the same menu and is the reversible option, so anyone reaching here has already
 * passed a gentler alternative.
 */
export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
  onDeleted,
}: {
  project: ProjectSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const remove = useDeleteProject(project);

  function close(next: boolean) {
    if (!next) remove.reset();
    onOpenChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={`Delete “${project.name}”?`}
      description="This removes the project and its entire revision history. It cannot be undone."
      footer={
        <>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            pending={remove.isPending}
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  close(false);
                  onDeleted?.();
                },
              })
            }
          >
            Delete project
          </Button>
        </>
      }
    >
      {formErrorMessage(remove.error) && <FormError>{formErrorMessage(remove.error)}</FormError>}
    </Dialog>
  );
}
