import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fetchHealth } from '../api/health.js';
import styles from './AuthLayout.module.css';

/**
 * Checks whether the API is actually reachable.
 *
 * This exists so the sign-in screen does not blame the user for an offline server: with
 * the API down, a failed login looks exactly like a wrong password. It runs once, in the
 * background, and stays silent unless the answer is bad.
 */
function useApiReachable(): boolean {
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetchHealth(controller.signal)
      .then(() => setReachable(true))
      .catch(() => {
        if (!controller.signal.aborted) setReachable(false);
      });

    return () => controller.abort();
  }, []);

  return reachable;
}

export interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const reachable = useApiReachable();

  return (
    <div className={styles.screen}>
      <main className={styles.card}>
        <span className={styles.wordmark}>UI Builder</span>

        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>

        {children}

        {!reachable && (
          <p className={styles.offline}>
            <AlertTriangle size={14} aria-hidden="true" />
            The API server is not responding.
          </p>
        )}

        <p className={styles.footer}>{footer}</p>
      </main>
    </div>
  );
}
