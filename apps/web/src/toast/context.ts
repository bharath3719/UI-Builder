import { createContext, use } from 'react';

/**
 * What a toast is *about*, which is the only thing a caller chooses.
 *
 * Three rather than a colour prop, for the same reason the tokens keep semantic colours
 * apart from the accent (PLAN.md §8): a toast's tint has to mean something. `danger` is
 * "this did not happen", `warn` is "this happened, but not the way you meant", `ok` is
 * "this happened" — and nothing reaches for one of them to be decorative.
 */
export type ToastTone = 'danger' | 'warn' | 'ok';

export interface ToastOptions {
  /** A short noun phrase — "Could not save". Optional; the message alone is often enough. */
  title?: string;
  /**
   * Collapses repeats onto one toast instead of stacking them.
   *
   * Defaults to the tone and message together, which already covers the common case. It is
   * worth setting explicitly when the *message* varies but the event does not: a page query
   * that keeps failing produces a different status each time, and twelve toasts about one
   * broken endpoint is the failure mode this exists to prevent.
   */
  key?: string;
  /**
   * How long before it leaves, in milliseconds. Defaults by tone — see `DURATIONS`.
   * `0` pins it until it is dismissed, for something the user must actually act on.
   */
  duration?: number;
  /** One button, for the thing the user would otherwise go looking for. */
  action?: { label: string; onClick: () => void };
}

export interface ToastHandle {
  /** Shows one, and returns its id so a caller can take it back down itself. */
  show: (tone: ToastTone, message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  warn: (message: string, options?: ToastOptions) => string;
  success: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastHandle | null>(null);

export function useToast(): ToastHandle {
  const handle = use(ToastContext);

  if (!handle) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }

  return handle;
}
