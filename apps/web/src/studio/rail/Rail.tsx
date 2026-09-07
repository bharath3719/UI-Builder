/**
 * The left rail — one icon per left-panel view, and the switch between them.
 *
 * The left panel used to stack all three views at once, split by two draggable
 * separators. That reads as three cramped panels rather than one useful one: the
 * palette is a list you scan, the layers tree grows with the design, and every project
 * spent its first minutes with both of them too short to be worth looking at. A rail
 * gives whichever one is in use the whole column, and costs one click to change your
 * mind — which is the trade every editor of this shape has settled on.
 *
 * Pressing the view that is already open collapses the panel entirely. That is the
 * rail's second job: the fastest way to give the canvas the width back, without
 * dragging a separator to the edge and then having to find it again.
 */

import { Blocks, Component, Database, Files, Layers } from 'lucide-react';
import { RAIL_LABELS, RAIL_VIEWS, type RailView } from './views.js';
import styles from './Rail.module.css';

const RAIL_ICONS: Record<RailView, typeof Files> = {
  pages: Files,
  // The same icon a symbol wears in the palette and the layers tree, so the three read
  // as one thing seen from three places.
  components: Component,
  library: Blocks,
  layers: Layers,
  data: Database,
};

export function Rail({
  view,
  onSelect,
}: {
  /** Null when the panel is collapsed — no view is current. */
  view: RailView | null;
  onSelect: (view: RailView | null) => void;
}) {
  return (
    <div className={styles.rail} role="tablist" aria-orientation="vertical" aria-label="Panels">
      {RAIL_VIEWS.map((name) => {
        const Icon = RAIL_ICONS[name];
        const active = view === name;

        return (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={active}
            className={[styles.item, active ? styles.itemActive : ''].filter(Boolean).join(' ')}
            title={active ? `Hide ${RAIL_LABELS[name]}` : RAIL_LABELS[name]}
            aria-label={RAIL_LABELS[name]}
            onClick={() => onSelect(active ? null : name)}
          >
            <Icon size={17} strokeWidth={1.75} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
