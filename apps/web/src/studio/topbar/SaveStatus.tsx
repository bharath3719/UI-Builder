import { AlertTriangle, Check, CloudOff, Loader2, Pencil } from 'lucide-react';
import type { SaveStatus as Status } from '../state/usePersistence.js';
import { useStudio } from '../state/context.js';
import styles from './SaveStatus.module.css';

/**
 * What each state says, and how loudly.
 *
 * `saved` and `dirty` are the two the user sees for hours, so both are quiet grey text
 * with no icon that moves — an indicator that pulses on every keystroke trains people to
 * ignore it, which is precisely when the one state that matters stops being read. Only
 * the two failures take a colour.
 */
const LABELS: Record<Status, { text: string; title: string; tone?: 'danger' }> = {
  loading: { text: 'Loading…', title: 'Loading the document' },
  saved: { text: 'Saved', title: 'Every change is saved' },
  dirty: { text: 'Unsaved', title: 'Unsaved changes — saving shortly' },
  saving: { text: 'Saving…', title: 'Saving' },
  error: { text: 'Not saved', title: 'The last save failed', tone: 'danger' },
  conflict: { text: 'Conflict', title: 'This project was changed elsewhere', tone: 'danger' },
};

function StatusIcon({ status }: { status: Status }) {
  switch (status) {
    case 'saving':
    case 'loading':
      return <Loader2 size={13} className={styles.spin} aria-hidden="true" />;
    case 'saved':
      return <Check size={13} aria-hidden="true" />;
    case 'dirty':
      return <Pencil size={13} aria-hidden="true" />;
    case 'error':
      return <CloudOff size={13} aria-hidden="true" />;
    case 'conflict':
      return <AlertTriangle size={13} aria-hidden="true" />;
  }
}

/**
 * The save indicator.
 *
 * `aria-live="polite"` rather than a silent label: for someone who cannot see the row,
 * "saved" arriving a second after they stopped typing is the only confirmation there is.
 * It is polite, not assertive, because it must never interrupt what is being typed.
 */
export function SaveStatus() {
  const { writable, persistence } = useStudio();

  if (!writable) {
    return (
      <span className={styles.status} title="You have view-only access to this project">
        Read only
      </span>
    );
  }

  const { text, title, tone } = LABELS[persistence.status];

  return (
    <span
      className={[styles.status, tone === 'danger' && styles.danger].filter(Boolean).join(' ')}
      title={persistence.problem ?? title}
      aria-live="polite"
    >
      <StatusIcon status={persistence.status} />
      {text}
    </span>
  );
}
