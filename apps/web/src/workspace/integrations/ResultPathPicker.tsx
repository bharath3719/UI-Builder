import { arrayPaths, fieldsOf, previewValue, rowsAt, type Json } from '@ui-builder/schema';
import styles from './Integrations.module.css';

/**
 * Says where an endpoint's rows are, using a captured response to make it a choice rather
 * than a thing to remember.
 *
 * It is stored on the endpoint, not worked out per page, because it is a fact about the
 * API and not about any one screen. The sample only *helps* choose it: a stale sample can
 * make a valid path look wrong, so the field stays editable and the picker is a
 * convenience over it, never a gate.
 */
export function ResultPathPicker({
  sample,
  value,
  disabled,
  onChange,
}: {
  sample: Json | null;
  value: string;
  disabled?: boolean;
  onChange: (path: string) => void;
}) {
  const paths = arrayPaths(sample);
  const rows = rowsAt(sample, value);
  const fields = fieldsOf(rows);
  const first = rows[0];

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="endpoint-result-path">
        Where the rows are
      </label>

      {sample === null ? (
        <p className={styles.hint}>
          Run this endpoint once and the response will be captured here, so you can pick the list
          instead of typing a path.
        </p>
      ) : paths.length === 0 ? (
        <p className={styles.hint}>
          The captured response has no list in it. That is fine for an endpoint bound to single
          values; leave this empty.
        </p>
      ) : (
        <div className={styles.pathOptions}>
          {paths.map((path) => {
            const count = rowsAt(sample, path).length;

            return (
              <button
                key={path}
                type="button"
                disabled={disabled}
                className={[styles.pathOption, path === value && styles.pathOptionOn]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={path === value}
                onClick={() => onChange(path)}
              >
                <code>{path === '' ? 'the response itself' : path}</code>
                <span className={styles.pathCount}>
                  {count} {count === 1 ? 'row' : 'rows'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <input
        id="endpoint-result-path"
        className={styles.input}
        value={value}
        disabled={disabled}
        placeholder="data.items — or empty when the response is the list"
        onChange={(event) => onChange(event.target.value)}
      />

      {fields.length > 0 && (
        <div className={styles.fields}>
          <span className={styles.fieldsLabel}>
            A row has {fields.length} {fields.length === 1 ? 'field' : 'fields'}:
          </span>
          <ul className={styles.fieldList}>
            {fields.map((field) => (
              <li key={field}>
                <code>{field}</code>
                <span className={styles.fieldSample}>
                  {previewValue(
                    typeof first === 'object' && first !== null && !Array.isArray(first)
                      ? first[field]
                      : undefined,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
