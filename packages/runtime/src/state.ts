/**
 * Page state — the `state` root of the render scope (PLAN.md §10).
 *
 * Two rules shape the whole file. Values are held **by id**, so renaming a variable in
 * the panel does not lose what the page was holding, and the name-keyed object the scope
 * needs is derived. And a variable that has not been written to has *no* entry, so its
 * value is its `initial` — which is what makes an edit in the panel show on the canvas at
 * once, and what makes adding or deleting a variable mid-session need no reconciliation
 * at all.
 */

import { isTruthy, stringifyValue, type Json, type StateVar } from '@ui-builder/schema';
import { useCallback, useMemo, useReducer } from 'react';

/** Written values, by variable id. Absent means "still the declared initial". */
export type StateOverrides = Readonly<Record<string, Json>>;

export type StateAction =
  | { kind: 'set'; id: string; value: Json }
  /** Carries the initial so that two toggles in one handler both count (see below). */
  | { kind: 'toggle'; id: string; initial: Json }
  /** The same, for the write whose second application is a clear. Carries it for the
   * same reason: what it compares against has to be what the store holds. */
  | { kind: 'filter'; id: string; initial: Json; value: string };

const NOTHING_WRITTEN: StateOverrides = Object.freeze({});

/**
 * A reducer rather than `useState`, so `toggle` reads the value it is inverting from the
 * store instead of from the render that scheduled it. Two `toggleState` steps in one
 * handler are then two flips; through a stale closure they would be one.
 */
export function stateReducer(overrides: StateOverrides, action: StateAction): StateOverrides {
  if (action.kind === 'set') {
    // Writing what is already there returns the same object, so React bails out of the
    // re-render. A `setState` in a handler that fires on every keystroke is common enough
    // to be worth the two lines.
    const held = overrides[action.id];
    if (held !== undefined && Object.is(held, action.value)) return overrides;
    return { ...overrides, [action.id]: action.value };
  }

  const held = overrides[action.id];
  const settled = held === undefined ? action.initial : held;

  if (action.kind === 'filter') {
    // Compared as text: a filter is a category, and a `2024` typed into a variable's
    // initial and a `2024` arriving off a chart are the same filter — which comparing the
    // raw values would deny. Cleared to the empty string for the same reason, whatever the
    // variable's declared type, because empty is what a query's text tests for.
    const picked = stringifyValue(settled) === action.value ? '' : action.value;
    return { ...overrides, [action.id]: picked };
  }

  return { ...overrides, [action.id]: !isTruthy(settled) };
}

/** The `state` object an expression sees: names to values, initials filled in. */
export function resolveStateValues(
  variables: readonly StateVar[],
  overrides: StateOverrides,
): Record<string, Json> {
  const values: Record<string, Json> = {};

  for (const variable of variables) {
    const held = overrides[variable.id];
    values[variable.name] = held === undefined ? variable.initial : held;
  }

  return values;
}

export interface PageState {
  /** By name, for the scope. */
  values: Record<string, Json>;
  setValue: (id: string, value: Json) => void;
  toggle: (id: string) => void;
  /** Writes the category, or clears it when the variable already holds it. */
  filter: (id: string, value: string) => void;
}

export function usePageState(variables: readonly StateVar[]): PageState {
  const [overrides, dispatch] = useReducer(stateReducer, NOTHING_WRITTEN);

  const values = useMemo(() => resolveStateValues(variables, overrides), [variables, overrides]);

  const setValue = useCallback(
    (id: string, value: Json) => dispatch({ kind: 'set', id, value }),
    [],
  );

  const toggle = useCallback(
    (id: string) => {
      const variable = variables.find((candidate) => candidate.id === id);
      dispatch({ kind: 'toggle', id, initial: variable?.initial ?? false });
    },
    [variables],
  );

  const filter = useCallback(
    (id: string, value: string) => {
      const variable = variables.find((candidate) => candidate.id === id);
      dispatch({ kind: 'filter', id, initial: variable?.initial ?? '', value });
    },
    [variables],
  );

  return useMemo(() => ({ values, setValue, toggle, filter }), [values, setValue, toggle, filter]);
}
