import styles from './Spinner.module.css';

/**
 * A hairline arc rather than a filled dot or a bouncing set — it reads as "working"
 * without adding a second saturated thing to the screen (§8).
 */
export function Spinner({ size = 14, label }: { size?: number; label?: string }) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
