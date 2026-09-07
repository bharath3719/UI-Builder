/**
 * A collapsible group of inspector fields.
 *
 * Collapsible because the Design tab is nine sections deep and nobody uses all nine
 * at once; the open set is remembered per section name so a panel someone arranged
 * for typography work is still arranged that way after a reload.
 *
 * The dot in the header answers "is anything set here, in this breakpoint and state?"
 * — the question that matters when a section is closed, and the reason a closed
 * section is safe to close at all.
 */

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { hasOwnDecls } from '@ui-builder/schema';
import { useStudio } from '../state/context.js';
import styles from './Inspector.module.css';

const STORAGE_KEY = 'ui-builder.inspector.closed';

/** The closed set, as a plain array of names in one key. */
function readClosed(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : [];
  } catch {
    // A disabled or full storage must not stop the panel rendering.
    return [];
  }
}

function writeClosed(names: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    /* Not worth surfacing: the panel still works, it just forgets. */
  }
}

export function Section({
  title,
  /** The properties whose presence in the active cell lights the header dot. */
  properties = [],
  children,
}: {
  title: string;
  properties?: readonly string[];
  children: React.ReactNode;
}) {
  const [closed, setClosed] = useState(() => readClosed().includes(title));
  const { page, selectedIds, cell } = useStudio();

  const toggle = useCallback(() => {
    setClosed((current) => {
      const next = !current;
      const names = readClosed().filter((name) => name !== title);
      writeClosed(next ? [...names, title] : names);
      return next;
    });
  }, [title]);

  // Any of them, not all: the dot means "there is something set in this cell here",
  // and a section holding one node's override is a section worth opening.
  const overridden = selectedIds.some((id) => {
    const node = page.nodes[id];
    return node ? hasOwnDecls(node, cell, properties) : false;
  });

  return (
    <section className={styles.group}>
      <button type="button" className={styles.groupHeader} aria-expanded={!closed} onClick={toggle}>
        <span className={styles.groupChevron} aria-hidden="true">
          {closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
        {title}
        {overridden ? (
          <span className={styles.groupDot} title="Set in this breakpoint and state" />
        ) : null}
      </button>

      {closed ? null : <div className={styles.groupBody}>{children}</div>}
    </section>
  );
}
