/**
 * Reading the style cascade back out — PLAN.md §9.
 *
 * `style.ts` turns a `StyleSet` into CSS for the browser to cascade. The inspector
 * needs the opposite: given a breakpoint and a state, what value would a field show,
 * and *where did it come from*? A field cannot render an "overridden" dot, a reset
 * action, or a placeholder showing the value it is inheriting without that answer.
 *
 * Doing it here rather than in the panel is what keeps the two in agreement. This
 * resolves against the same mobile-first, source-order rules `serializeNodeStyles`
 * emits — a wider breakpoint overrides a narrower one, a state overrides `default` —
 * so the value the inspector reports is the value the browser computes.
 */

import type { Node, StyleDecls, StyleState, Theme } from './doc.js';

/**
 * Where a resolved declaration was written.
 *
 * - `own` — this exact breakpoint/state cell. The only case a reset can clear.
 * - `inherited` — a narrower breakpoint, or the `default` state of this one. The
 *   field shows it greyed: real, but not editable from here without taking it over.
 * - `none` — nothing anywhere; the component's own CSS decides.
 */
export type DeclOrigin = 'own' | 'inherited' | 'none';

export interface ResolvedDecl {
  value: string | number | undefined;
  origin: DeclOrigin;
  /** The breakpoint the winning declaration was written in, when there is one. */
  breakpoint?: string;
  /** The state the winning declaration was written in, when there is one. */
  state?: StyleState;
}

/**
 * The breakpoints that apply at (and below) `breakpointId`, narrowest first — the
 * order the browser cascades them in.
 *
 * `base` is unconditional and therefore always first. An id the theme does not know
 * is treated as base only, rather than throwing: a document can outlive the theme
 * that produced it, and a stale breakpoint should degrade to "not applied", not to a
 * crash in the panel.
 */
export function activeBreakpoints(theme: Theme, breakpointId: string): string[] {
  if (breakpointId === 'base') return ['base'];

  const target = theme.breakpoints.find((breakpoint) => breakpoint.id === breakpointId);
  if (!target) return ['base'];

  const applies = theme.breakpoints
    .filter((breakpoint) => breakpoint.id !== 'base' && breakpoint.minWidth > 0)
    .filter((breakpoint) => breakpoint.minWidth <= target.minWidth)
    .sort((a, b) => a.minWidth - b.minWidth)
    .map((breakpoint) => breakpoint.id);

  return ['base', ...applies];
}

/**
 * The states that apply when editing `state`, weakest first.
 *
 * `default` always applies — a hover rule adds to the default one rather than
 * replacing it, which is exactly what `statesText` emits and what the browser then
 * cascades by source order.
 */
function activeStates(state: StyleState): StyleState[] {
  return state === 'default' ? ['default'] : ['default', state];
}

/**
 * The value one property resolves to in a given cell, and where it came from.
 *
 * Later entries win, so the walk goes narrowest-to-widest breakpoint and
 * default-to-state — the same order the stylesheet is written in. The last write
 * seen is the winner, and it is `own` only if it was made in the cell being edited.
 */
export function resolveDecl(
  node: Node,
  theme: Theme,
  cell: { breakpoint: string; state: StyleState },
  property: string,
): ResolvedDecl {
  let winner: ResolvedDecl = { value: undefined, origin: 'none' };

  for (const breakpoint of activeBreakpoints(theme, cell.breakpoint)) {
    for (const state of activeStates(cell.state)) {
      const value = node.styles[breakpoint]?.[state]?.[property];
      if (value === undefined) continue;

      winner = {
        value,
        origin: breakpoint === cell.breakpoint && state === cell.state ? 'own' : 'inherited',
        breakpoint,
        state,
      };
    }
  }

  return winner;
}

/**
 * Every declaration that applies in a cell, flattened. The order of the walk means a
 * later write overwrites an earlier one, which is the cascade.
 *
 * Used by the canvas to preview a pseudo-state without triggering it, and by any
 * field that needs to reason about the whole set rather than one property.
 */
export function resolveDecls(
  node: Node,
  theme: Theme,
  cell: { breakpoint: string; state: StyleState },
): StyleDecls {
  const decls: StyleDecls = {};

  for (const breakpoint of activeBreakpoints(theme, cell.breakpoint)) {
    for (const state of activeStates(cell.state)) {
      const bucket = node.styles[breakpoint]?.[state];
      if (!bucket) continue;
      for (const [property, value] of Object.entries(bucket)) decls[property] = value;
    }
  }

  return decls;
}

/**
 * The declarations written *in* one cell — what a reset would clear, and what the
 * "overridden" dot on a section header counts.
 */
export function ownDecls(node: Node, cell: { breakpoint: string; state: StyleState }): StyleDecls {
  return { ...(node.styles[cell.breakpoint]?.[cell.state] ?? {}) };
}

/**
 * Whether a cell holds a value for any of `properties` — the section-header dot.
 *
 * Sections ask about their own property list rather than counting the whole cell, so
 * the dot on "Typography" means "something in Typography is set here" rather than
 * "something, somewhere, is".
 */
export function hasOwnDecls(
  node: Node,
  cell: { breakpoint: string; state: StyleState },
  properties: readonly string[],
): boolean {
  const bucket = node.styles[cell.breakpoint]?.[cell.state];
  if (!bucket) return false;
  return properties.some((property) => bucket[property] !== undefined);
}
