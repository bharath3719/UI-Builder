import { useId } from 'react';
import styles from './Field.module.css';

export interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Shown under the field in the danger colour, and marks the input invalid. */
  error?: string | undefined;
  /** Shown under the field when there is no error. */
  hint?: string;
  /** Static text before the input, e.g. the URL a slug will live under. */
  prefix?: string;
}

/**
 * Label, input and message as one unit, wired together by a generated id so the label
 * is clickable and the error is announced. Every text input in the studio goes through
 * this — a bare `<input>` would be a styling and accessibility fork.
 */
export function Field({ label, error, hint, prefix, className, ...rest }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error ?? hint);

  const input = (
    <input
      {...rest}
      id={id}
      className={[styles.input, error && styles.invalid, className].filter(Boolean).join(' ')}
      aria-invalid={error ? true : undefined}
      aria-describedby={hasMessage ? messageId : undefined}
    />
  );

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>

      {prefix ? (
        <div className={styles.affixed}>
          <span className={styles.affix}>{prefix}</span>
          {input}
        </div>
      ) : (
        input
      )}

      {error ? (
        <span id={messageId} className={styles.error} role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span id={messageId} className={styles.hint}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}
