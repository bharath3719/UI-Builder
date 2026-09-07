import { useState } from 'react';
import { useNavigate } from 'react-router';
import { DisplayName } from '@ui-builder/schema';
import { useCreateProject } from '../api/queries.js';
import { formErrorMessage, serverFieldErrors } from '../lib/formErrors.js';
import { Button } from '../ui/Button.js';
import { Dialog, DialogClose, FormError } from '../ui/Dialog.js';
import { Field } from '../ui/Field.js';

/**
 * Creates a project and goes straight into its editor — the only reason to make one is
 * to start building, so stopping to admire it in the grid first would be a wasted click.
 */
export function NewProjectDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const create = useCreateProject(workspaceId);
  const navigate = useNavigate();

  function close(next: boolean) {
    if (!next) {
      setName('');
      setNameError(undefined);
      create.reset();
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

    setNameError(undefined);
    create.mutate(
      { name: parsed.data },
      {
        onSuccess: (project) => {
          close(false);
          void navigate(`/p/${project.id}`);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="New project"
      onSubmit={handleSubmit}
      footer={
        <>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button type="submit" variant="primary" pending={create.isPending}>
            Create project
          </Button>
        </>
      }
    >
      {formErrorMessage(create.error) && <FormError>{formErrorMessage(create.error)}</FormError>}

      <Field
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Marketing site"
        autoFocus
        maxLength={80}
        error={nameError ?? serverFieldErrors(create.error).name}
      />
    </Dialog>
  );
}
