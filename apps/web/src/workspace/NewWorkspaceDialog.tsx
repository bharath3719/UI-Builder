import { useState } from 'react';
import { useNavigate } from 'react-router';
import { DisplayName, slugify } from '@ui-builder/schema';
import { useCreateWorkspace } from '../api/queries.js';
import { formErrorMessage, serverFieldErrors } from '../lib/formErrors.js';
import { Button } from '../ui/Button.js';
import { Dialog, DialogClose, FormError } from '../ui/Dialog.js';
import { Field } from '../ui/Field.js';

/**
 * Creating a workspace asks for a name and nothing else. The slug is derived server-side
 * (with a numeric suffix if it collides), and shown here only so the URL is not a
 * surprise — a second required field for something we can compute would be friction for
 * the sake of it.
 */
export function NewWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const create = useCreateWorkspace();
  const navigate = useNavigate();

  const preview = slugify(name);

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
        onSuccess: (workspace) => {
          close(false);
          void navigate(`/w/${workspace.slug}`);
        },
      },
    );
  }

  const serverError = serverFieldErrors(create.error).name;

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="New workspace"
      description="A workspace holds projects and the people who can edit them."
      onSubmit={handleSubmit}
      footer={
        <>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button type="submit" variant="primary" pending={create.isPending}>
            Create workspace
          </Button>
        </>
      }
    >
      {formErrorMessage(create.error) && <FormError>{formErrorMessage(create.error)}</FormError>}

      <Field
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
        maxLength={80}
        error={nameError ?? serverError}
        hint={preview ? `Its address will be /w/${preview}` : undefined}
      />
    </Dialog>
  );
}
