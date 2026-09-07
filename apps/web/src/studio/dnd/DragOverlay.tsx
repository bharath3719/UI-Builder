import { useStudio } from '../state/context.js';
import type { DropContext, DropIndicator } from '../state/context.js';
import styles from './DragOverlay.module.css';

/**
 * The feedback a drag gets: which container will receive it, where inside that
 * container it will land, what that spot is next to, and what is being carried.
 *
 * All of it is rendered once at the studio level in fixed coordinates, rather than
 * inside whichever panel the pointer happens to be over — a ghost parented to the
 * palette would be clipped by the palette's own scroll container the moment it left it.
 */
export function DragOverlay() {
  const { drag } = useStudio();
  if (!drag) return null;

  const { target } = drag;

  return (
    <div className={styles.layer} aria-hidden>
      {target ? (
        <>
          {/* The container being dropped into. A line alone marks a gap without saying
              whose gap it is, and at a flush edge that is genuinely ambiguous — the
              same pixel is the bottom of one card and the top of the stack holding it.
              Only for lines: a box indicator is already an outline of the container. */}
          {target.indicator.kind === 'line' && target.context.parentRect ? (
            <div className={styles.container} style={rectStyle(target.context.parentRect)} />
          ) : null}

          <div
            className={target.indicator.kind === 'line' ? styles.line : styles.box}
            style={rectStyle(target.indicator)}
          />

          <div className={styles.tag} style={tagStyle(target.indicator)}>
            {describe(target.context)}
          </div>
        </>
      ) : null}

      {/* Offset from the cursor rather than under it, so the ghost never covers the
          gap the indicator is pointing at. */}
      <div className={styles.ghost} style={{ left: drag.x + 12, top: drag.y + 12 }}>
        {drag.label}
        {!target ? <span className={styles.ghostBlocked}>no drop here</span> : null}
      </div>
    </div>
  );
}

/** The drop as a sentence fragment: what it lands beside, or what it lands in. */
function describe(context: DropContext): string {
  if (!context.anchor) return `into ${context.parentName}`;
  return `${context.anchor.edge} ${context.anchor.name}`;
}

/** How far a clamped label stays clear of the window edge. */
const EDGE_GAP = 4;

/**
 * Where the label sits: on the indicator's leading end, so the words and the mark they
 * explain are one object rather than two things to look at.
 *
 * Clamped to the viewport because the canvas pans: a line whose start is off the left
 * of the screen is still worth labelling, and a label at a negative offset is not.
 */
function tagStyle(indicator: DropIndicator): React.CSSProperties {
  if (indicator.kind === 'box') {
    return {
      left: Math.max(indicator.left, EDGE_GAP),
      top: indicator.top,
      transform: 'translateY(-100%)',
    };
  }

  // Which way the line runs, from the shape it was given.
  if (indicator.width >= indicator.height) {
    return {
      left: Math.max(indicator.left, EDGE_GAP),
      top: indicator.top + indicator.height / 2,
      transform: 'translateY(-50%)',
    };
  }

  return {
    left: indicator.left + indicator.width / 2,
    top: Math.max(indicator.top, EDGE_GAP),
    transform: 'translateX(-50%)',
  };
}

function rectStyle(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): React.CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}
