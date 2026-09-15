/**
 * The studio's toaster — transient messages about things that happened off to the side.
 *
 * ## What belongs here, and what does not
 *
 * A toast is for a failure whose *cause* is not on screen. A form that rejects a field
 * shows it under the field; a dialog whose save is refused shows it in the dialog — both
 * are already looking at the thing that failed, and a toast would be a second copy of the
 * same sentence somewhere less useful. What had no home before this is everything that
 * fails while the user is doing something else: a page query that 401s halfway through a
 * drag, an autosave that stops working, a session that expires in a background tab.
 *
 * ## Not the page's toasts
 *
 * `@ui-builder/runtime` has a `Toast` of its own. That one is an *action step* — a thing
 * the document being built can do to whoever ends up using it — and it renders inside the
 * canvas iframe, under the page's own stylesheet. This one is studio chrome and lives in
 * the parent document. They share a word and nothing else, which is why neither imports
 * the other.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { ToastContext, type ToastHandle, type ToastOptions, type ToastTone } from './context.js';
import styles from './ToastProvider.module.css';

interface ToastRecord {
  id: string;
  key: string;
  tone: ToastTone;
  title: string | undefined;
  message: string;
  duration: number;
  action: ToastOptions['action'];
  /**
   * Bumped when a duplicate arrives, which restarts the timer without remounting the row.
   *
   * The alternative — dropping the old record and pushing a new one — makes the toast jump
   * to the bottom of the stack and replay its entry animation every time the same failure
   * repeats, which reads as several failures rather than one that is ongoing.
   */
  repeat: number;
}

/**
 * How long each tone stays, in milliseconds.
 *
 * A failure outlives a success on purpose. "Saved" is confirming something the user just
 * did and already expects, so it only has to be *seen*; "could not save" is news, usually
 * arrives while they are looking somewhere else, and often names something they have to
 * decide about. The same four seconds for both would mean the only message that matters is
 * the one most likely to be missed.
 */
const DURATIONS: Record<ToastTone, number> = {
  danger: 10_000,
  warn: 8_000,
  ok: 4_000,
};

/**
 * The most that are ever on screen, oldest dropped first.
 *
 * Four is about where a stack stops being a list of problems and starts being a wall in
 * front of the canvas. Anything past it is nearly always the same failure repeating, which
 * `key` already collapses — so the cap is a backstop for the case where it is not.
 */
const MAX_VISIBLE = 4;

const ICONS: Record<ToastTone, typeof AlertCircle> = {
  danger: AlertCircle,
  warn: AlertTriangle,
  ok: CheckCircle2,
};

let counter = 0;

function nextId(): string {
  counter += 1;
  return `t${counter}`;
}

/**
 * One row, owning its own dismissal timer.
 *
 * Per-row rather than a map of timers in the provider, because the timer's lifetime *is*
 * the row's lifetime — mounting starts it, unmounting clears it, and `repeat` restarting it
 * is an ordinary dependency change. A central map would have to reimplement all three.
 */
function ToastRow({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: string) => void }) {
  const Icon = ICONS[toast.tone];

  /**
   * Set while the pointer is over the row or focus is inside it, which holds the timer.
   *
   * Without it a toast carrying an action button is a race: the button is on screen for
   * four seconds whether or not anyone is reading, and reaching for it is exactly the
   * gesture that should stop the clock.
   */
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (toast.duration === 0 || held) return;

    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
    // `repeat` is the point of being in the list: a duplicate restarts the countdown.
  }, [toast.id, toast.duration, toast.repeat, held, onDismiss]);

  return (
    <li
      className={`${styles.toast} ${styles[toast.tone]}`}
      /* `alert` is assertive and interrupts; a success has no business doing that. */
      role={toast.tone === 'ok' ? 'status' : 'alert'}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <Icon className={styles.icon} size={14} aria-hidden />

      <div className={styles.text}>
        {toast.title && <p className={styles.title}>{toast.title}</p>}
        <p className={styles.message}>{toast.message}</p>

        {toast.action && (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        className={styles.close}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        <X size={12} aria-hidden />
      </button>
    </li>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  /**
   * The id a `show` call returns.
   *
   * Assigned before the state updater runs, not inside it: an updater can be called twice
   * under StrictMode, and an id minted in there would be a different one from the id handed
   * back — so `dismiss(returnedId)` would quietly do nothing.
   */
  const show = useCallback((tone: ToastTone, message: string, options?: ToastOptions) => {
    const id = nextId();
    const key = options?.key ?? `${tone}:${message}`;

    setToasts((current) => {
      const existing = current.find((toast) => toast.key === key);

      // A repeat updates the row in place — same position, same id, restarted timer — so a
      // failure that keeps happening reads as one ongoing problem rather than a pile.
      if (existing) {
        return current.map((toast) =>
          toast.key === key
            ? {
                ...toast,
                tone,
                message,
                title: options?.title,
                duration: options?.duration ?? DURATIONS[tone],
                action: options?.action,
                repeat: toast.repeat + 1,
              }
            : toast,
        );
      }

      const record: ToastRecord = {
        id,
        key,
        tone,
        title: options?.title,
        message,
        duration: options?.duration ?? DURATIONS[tone],
        action: options?.action,
        repeat: 0,
      };

      return [...current, record].slice(-MAX_VISIBLE);
    });

    return id;
  }, []);

  const handle = useMemo<ToastHandle>(
    () => ({
      show,
      error: (message, options) => show('danger', message, options),
      warn: (message, options) => show('warn', message, options),
      success: (message, options) => show('ok', message, options),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext value={handle}>
      {children}

      {/*
        Always mounted, even when empty. The live region has to exist *before* the message
        lands in it or a screen reader has nothing to announce — a region that appears
        already containing text is usually read as page content, not as an announcement.
      */}
      <ol className={styles.viewport} aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </ol>
    </ToastContext>
  );
}
