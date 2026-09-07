import { useState } from 'react';
import { Button } from '../../ui/Button.js';
import { Dialog } from '../../ui/Dialog.js';
import { useStudio } from '../state/context.js';

/**
 * What to do when the save was refused because the project moved on — PLAN.md §12.
 *
 * The plan said "refetch + rebase". Rebasing is what a patch-based history would allow
 * and a snapshot-based one cannot: with two whole documents and no record of which
 * fields each side touched, a merge would have to guess, and a guess that silently
 * discards half of someone's styling is a worse outcome than any dialog. So the choice
 * is put to the person who knows which side matters, with both sides still intact —
 * "keep mine" writes over the server, "load theirs" replaces the canvas, and neither
 * destroys anything the history panel cannot get back.
 *
 * Not dismissible: autosave has stopped, and closing this would leave the studio
 * quietly accumulating edits that will never be written.
 */
export function ConflictDialog() {
  const { persistence, adoptDoc } = useStudio();
  const [working, setWorking] = useState(false);

  const open = persistence.status === 'conflict';
  const { serverDoc, version } = persistence;

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        /* Held open on purpose — one of the two buttons has to be the way out. */
      }}
      title="This project was changed somewhere else"
      description={
        serverDoc
          ? 'Another tab or another person saved while you were editing. Your changes are still here, and so is theirs — pick which one this project keeps.'
          : 'Another tab or another person saved while you were editing, and their version could not be fetched. Saving yours will replace it.'
      }
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={working || !serverDoc}
            title={
              serverDoc
                ? 'Discard your changes and load the saved version'
                : 'The saved version could not be fetched'
            }
            // `adoptDoc` installs it and moves the save baseline together, so the
            // document that has just been loaded is not immediately sent back.
            onClick={() => serverDoc && adoptDoc(serverDoc, version)}
          >
            Discard mine
          </Button>
          <Button
            type="button"
            pending={working}
            onClick={() => {
              setWorking(true);
              void persistence.keepMine().finally(() => setWorking(false));
            }}
          >
            Keep mine
          </Button>
        </>
      }
    >
      {persistence.problem}
    </Dialog>
  );
}
