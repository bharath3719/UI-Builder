import { useState } from 'react';
import { DisplayName, type ProjectSummary } from '@ui-builder/schema';
import { useUpdateProject } from '../api/queries.js';
import { formErrorMessage, serverFieldErrors } from '../lib/formErrors.js';
import { Button } from '../ui/Button.js';
import { Dialog, DialogClose, FormError } from '../ui/Dialog.js';
import { Field } from '../ui/Field.js';

/**
 * Renames a project without touching its slug. The two are deliberately allowed to
 * drift: the slug is a stable handle the workspace's URLs and exports can rely on, and
 * regenerating it on every rename would make it useless as one.
 */
export function RenameProjectDialog({
  project,
  open,
  onOpenChange,
  onRenamed,
}: {
  project: ProjectSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed?: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [nameError, setNameError] = useState<string>();
  const update = useUpdateProject(project);

  function close(next: boolean) {
    if (!next) {
      setName(project.name);
      setNameError(undefined);
      update.reset();
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = DisplayName.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'is required');
      return;
    }

    if (parsed.data === project.name) {
      close(false);
      return;
    }

    setNameError(undefined);
    update.mutate(
      { name: parsed.data },
      {
        onSuccess: () => {
          close(false);
          onRenamed?.();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Rename project"
      onSubmit={handleSubmit}
      footer={
        <>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button type="submit" variant="primary" pending={update.isPending}>
            Rename
          </Button>
        </>
      }
    >
      {formErrorMessage(update.error) && <FormError>{formErrorMessage(update.error)}</FormError>}

      <Field
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
        maxLength={80}
        error={nameError ?? serverFieldErrors(update.error).name}
      />
    </Dialog>
  );
}
