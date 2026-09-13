import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { headerProblem, type HeaderRow } from './headers.js';
import styles from './Integrations.module.css';

/**
 * A key/value editor for HTTP headers, used for both a connection's defaults and an
 * endpoint's own. The rows it edits are owned by the caller — see `headers.ts` for why
 * they are a list rather than the record they are stored as.
 */
export function HeadersEditor({
  rows,
  onChange,
  disabled,
  hint,
}: {
  rows: readonly HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
  disabled?: boolean;
  hint?: string;
}) {
  function update(index: number, patch: Partial<HeaderRow>) {
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className={styles.headers}>
      {rows.map((row, index) => {
        const problem = headerProblem(row.name);

        return (
          // Indexed on purpose: a header row has no stable identity — its name is the
          // thing being edited, so keying by it would remount the input on every
          // keystroke and lose the caret.
          <div className={styles.headerRow} key={index}>
            <div className={styles.headerName}>
              <input
                className={[styles.input, problem && styles.inputInvalid].filter(Boolean).join(' ')}
                value={row.name}
                disabled={disabled}
                placeholder="Header"
                aria-label={`Header ${index + 1} name`}
                aria-invalid={problem ? true : undefined}
                onChange={(event) => update(index, { name: event.target.value })}
              />
              {problem && (
                <span className={styles.fieldError} role="alert">
                  {problem}
                </span>
              )}
            </div>

            <input
              className={styles.input}
              value={row.value}
              disabled={disabled}
              placeholder="Value, or {{ state.something }}"
              aria-label={`Header ${index + 1} value`}
              onChange={(event) => update(index, { value: event.target.value })}
            />

            <Button
              variant="ghost"
              iconOnly
              disabled={disabled}
              title="Remove this header"
              aria-label={`Remove header ${index + 1}`}
              onClick={() => onChange(rows.filter((_, at) => at !== index))}
            >
              <Trash2 size={14} aria-hidden="true" />
            </Button>
          </div>
        );
      })}

      <Button
        variant="ghost"
        disabled={disabled}
        onClick={() => onChange([...rows, { name: '', value: '' }])}
      >
        <Plus size={14} aria-hidden="true" />
        Add header
      </Button>

      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
