/**
 * The inspector — PLAN.md §9.
 *
 * Three tabs over one selected node: Design writes CSS into a breakpoint/state cell,
 * Props writes the component's own API, Interactions is Phase 11.
 *
 * The two switchers sit above the tabs rather than inside the Design tab, because the
 * cell they choose is also what the *canvas* is showing — picking `md` resizes the
 * artboard and picking `hover` forces the state on the selection. Putting them in the
 * tab would imply they were a property of the tab, and they would then disappear
 * while the Props tab was open even though the canvas was still obeying them.
 */

import { STYLE_STATES, type StyleState } from '@ui-builder/schema';
import { useState } from 'react';
import { useStudio } from '../state/context.js';
import { ARTBOARD_MAX_WIDTH, ARTBOARD_MIN_WIDTH } from '../canvas/viewport.js';
import { DesignTab } from './DesignTab.js';
import { InteractionsTab } from './InteractionsTab.js';
import { PropsTab } from './PropsTab.js';
import styles from './Inspector.module.css';

const TABS = ['Design', 'Props', 'Interactions'] as const;
type Tab = (typeof TABS)[number];

const STATE_LABELS: Record<StyleState, string> = {
  default: 'Default',
  hover: 'Hover',
  focus: 'Focus',
  active: 'Active',
  disabled: 'Disabled',
};

/**
 * Which cell edits land in, and what the canvas shows.
 *
 * Breakpoints are labelled by id (`base`, `sm`, `md`) rather than by device, with the
 * device name in the tooltip: the id is what appears in the document and in the
 * exported media query, and teaching it here is cheaper than teaching a mapping.
 */
function CellSwitchers() {
  const { theme, cell, setCell, artboardWidth, setArtboardWidth } = useStudio();

  return (
    <div className={styles.switchers}>
      {/* The breakpoint chips share their row with the width, because they are short
          and because the two say the same thing from different ends — which cell is
          being edited, and how wide the artboard showing it is. The five state names
          need the full width to themselves. */}
      <div className={styles.switcherRow}>
        <div className={styles.switcher} role="group" aria-label="Breakpoint">
          {theme.breakpoints.map((breakpoint) => {
            const active = breakpoint.id === cell.breakpoint;
            return (
              <button
                key={breakpoint.id}
                type="button"
                className={[styles.chip, active ? styles.chipActive : ''].filter(Boolean).join(' ')}
                aria-pressed={active}
                title={
                  breakpoint.minWidth > 0
                    ? `${breakpoint.label} — applies from ${breakpoint.minWidth}px up`
                    : `${breakpoint.label} — applies at every width`
                }
                onClick={() => setCell({ breakpoint: breakpoint.id })}
              >
                {breakpoint.id}
              </button>
            );
          })}
        </div>

        {/* The artboard's width. It follows the breakpoint chips, and is editable on
            its own so a layout can be checked at the awkward width between two
            breakpoints rather than only at the two. */}
        <label className={styles.width} title="Canvas width">
          <span className={styles.srOnly}>Canvas width</span>
          <input
            type="number"
            className={styles.widthInput}
            value={artboardWidth}
            min={ARTBOARD_MIN_WIDTH}
            max={ARTBOARD_MAX_WIDTH}
            step={8}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              setArtboardWidth(Math.min(Math.max(next, ARTBOARD_MIN_WIDTH), ARTBOARD_MAX_WIDTH));
            }}
          />
          <span className={styles.widthUnit}>px</span>
        </label>
      </div>

      <div className={styles.switcher} role="group" aria-label="State">
        {STYLE_STATES.map((state) => {
          const active = state === cell.state;
          return (
            <button
              key={state}
              type="button"
              className={[styles.chip, active ? styles.chipActive : ''].filter(Boolean).join(' ')}
              aria-pressed={active}
              title={
                state === 'default'
                  ? 'The resting state'
                  : `${STATE_LABELS[state]} — forced on the canvas while selected`
              }
              onClick={() => setCell({ state })}
            >
              {STATE_LABELS[state]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Inspector() {
  const { page, selectedId, selectedIds, specFor } = useStudio();
  const [tab, setTab] = useState<Tab>('Design');

  const node = selectedId ? page.nodes[selectedId] : undefined;

  if (!node) {
    return (
      <div className={styles.inspector}>
        <p className={styles.empty}>
          Select something on the canvas or in the layers tree to edit it.
        </p>
      </div>
    );
  }

  const spec = specFor(node.type);

  // Several nodes of one component are still one component, and the Props tab can go
  // on generating its fields from that spec — a `variant` written there means the same
  // thing for all of them. A selection of mixed types has no shared props panel to
  // generate, because two components' props only coincide by accident of name.
  const count = selectedIds.length;
  const uniform = selectedIds.every((id) => page.nodes[id]?.type === node.type);

  return (
    <div className={styles.inspector}>
      <header className={styles.identity}>
        <span className={styles.identityName} title={node.name}>
          {count > 1 ? `${count} layers` : node.name}
        </span>
        <span className={styles.identityType}>
          {count > 1 && !uniform ? 'Mixed' : (spec?.displayName ?? node.type)}
        </span>
      </header>

      <CellSwitchers />

      <div className={styles.tabs} role="tablist" aria-label="Inspector">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={[styles.tab, tab === name ? styles.tabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className={styles.scroll}>
        {tab === 'Design' ? <DesignTab /> : null}
        {/* Keyed by node, and it has to be. A field holds a draft that is only committed
            on blur, and two components can declare a prop of the same name — `text` is
            both a Text's body and a Button's label. Without the key React reuses the
            field across a selection change, and the draft typed for one node commits
            onto the next one selected. */}
        {tab === 'Props' ? (
          uniform ? (
            <PropsTab key={node.id} node={node} />
          ) : (
            <p className={styles.empty}>
              The selection holds more than one kind of component, so there is no shared set of
              props to edit. The Design tab still writes to all of them.
            </p>
          )
        ) : null}
        {/* The primary alone, not the whole selection: an action list is a sequence
            authored for one thing, and writing it onto every selected node is not an
            edit anyone asked for. */}
        {tab === 'Interactions' ? <InteractionsTab key={node.id} node={node} /> : null}
      </div>
    </div>
  );
}
