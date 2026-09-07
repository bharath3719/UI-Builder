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

import { isTruthy, type Json, type StateVar } from '@ui-builder/schema';
import { useCallback, useMemo, useReducer } from 'react';

/** Written values, by variable id. Absent means "still the declared initial". */
export type StateOverrides = Readonly<Record<string, Json>>;

export type StateAction =
  | { kind: 'set'; id: string; value: Json }
  /** Carries the initial so that two toggles in one handler both count (see below). */
  | { kind: 'toggle'; id: string; initial: Json };

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
  return { ...overrides, [action.id]: !isTruthy(held === undefined ? action.initial : held) };
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

  return useMemo(() => ({ values, setValue, toggle }), [values, setValue, toggle]);
}
