import { useState } from 'react';
import {
  normalizePagePath,
  pagePathAvailable,
  renamePage,
  setPagePath,
  type Page,
} from '@ui-builder/schema';
import { Button } from '../../ui/Button.js';
import { Dialog, DialogClose } from '../../ui/Dialog.js';
import { Field } from '../../ui/Field.js';
import { useStudio } from '../state/context.js';

/**
 * A page's name and its route, edited together.
 *
 * Together rather than as two inline edits because they are not the same kind of thing
 * and only one of them can fail: the name is a label, and the path is a key the exported
 * router matches on. A path that collides has to be refused with a reason, and there is
 * nowhere to put that reason on a row.
 */
export function PageSettingsDialog({
  page,
  open,
  onOpenChange,
}: {
  page: Page;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { doc, editDocument } = useStudio();

  const [name, setName] = useState(page.name);
  const [path, setPath] = useState(page.path);
  const [error, setError] = useState<string>();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();
    if (trimmed === '') {
      setError(undefined);
      return;
    }

    const wanted = normalizePagePath(path);
    if (!pagePathAvailable(doc, wanted, page.id)) {
      setError(`Another page already uses ${wanted}.`);
      return;
    }

    // One undo step for the dialog, not one per field: the two were decided together
    // and stepping back through half of a rename is not a state anyone asked for.
    editDocument((current) => setPagePath(renamePage(current, page.id, trimmed), page.id, wanted));
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Page settings"
      description="The name is the label in the pages list. The path is the route this page is exported and previewed at."
      onSubmit={handleSubmit}
      footer={
        <>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit">Save</Button>
        </>
      }
    >
      <Field
        label="Name"
        value={name}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setName(event.currentTarget.value)}
      />

      <Field
        label="Path"
        value={path}
        error={error}
        hint={
          error ? undefined : 'A leading slash is added for you. Use /users/:id for a parameter.'
        }
        placeholder="/about"
        spellCheck={false}
        onChange={(event) => {
          setPath(event.currentTarget.value);
          setError(undefined);
        }}
      />
    </Dialog>
  );
}
