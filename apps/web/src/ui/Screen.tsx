import { Spinner } from './Spinner.js';
import styles from './Screen.module.css';

/**
 * A whole-viewport wait. Nothing but a spinner on purpose: this appears for a few
 * hundred milliseconds while the session is restored, and a skeleton or a message
 * would flash more than it would inform.
 */
export function ScreenLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className={styles.screen}>
      <span className={styles.spinner}>
        <Spinner size={20} label={label} />
      </span>
    </div>
  );
}

/**
 * A whole-viewport dead end — a route that failed to load, or one that does not exist.
 * Plain text and the way out; no illustration (§8).
 */
export function ScreenMessage({
  title,
  message,
  actions,
}: {
  title: string;
  message?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>{title}</h1>
      {message && <p className={styles.message}>{message}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
