import * as RadixDialog from '@radix-ui/react-dialog';
import styles from './Dialog.module.css';

/**
 * A modal, with Radix handling the focus trap, the scroll lock, Esc and the aria wiring.
 *
 * Deliberately not a generic `<Dialog>` with slots: every modal in the studio is a short
 * form with a title, a body and a right-aligned button pair, so that shape is the API.
 */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Submits the form the body sits in. Given, the whole dialog becomes a `<form>`. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  onSubmit,
}: DialogProps) {
  const inner = (
    <>
      <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
      {description && (
        <RadixDialog.Description className={styles.description}>
          {description}
        </RadixDialog.Description>
      )}
      {/* A confirm dialog is title + description + buttons and nothing else; an empty
          body would still contribute its top margin. */}
      {children ? <div className={styles.body}>{children}</div> : null}
      <div className={styles.footer}>{footer}</div>
    </>
  );

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.scrim} />
        <RadixDialog.Content className={styles.content}>
          {onSubmit ? <form onSubmit={onSubmit}>{inner}</form> : inner}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** A whole-form failure — the mutation was rejected, not one field. */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.formError} role="alert">
      {children}
    </p>
  );
}

export const DialogClose = RadixDialog.Close;
