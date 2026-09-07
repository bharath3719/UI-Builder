/**
 * What a rendering page can do — state, queries, toasts and the dispatch behind every
 * handler on it (PLAN.md §10).
 *
 * One hook rather than a context provider per concern: the scope is a single value that
 * everything on the page reads, and assembling it in one place is what guarantees the
 * canvas, the preview and the export are looking at the same object graph.
 */

import type {
  ActionStep,
  Json,
  Node,
  Page,
  QueryState,
  RenderScope,
  Theme,
} from '@ui-builder/schema';
import { useCallback, useMemo, useState } from 'react';
import { runSteps } from './actions.js';
import { createEvaluator, runStatements, type EvalRealm } from './evaluate.js';
import { usePageQueries } from './queries.js';
import { usePageState } from './state.js';

/**
 * A page has no enclosing component, so it has no props.
 *
 * Frozen and shared rather than a fresh object per scope: the scope is a memo dependency
 * everything on the page reads through, and a new empty object each render would make it
 * change on every render. Inside a symbol this slot holds the instance's values instead —
 * see `SymbolInstance` in `PageRenderer`.
 */
const NO_PROPS: Record<string, Json> = Object.freeze({});

export interface Toast {
  id: number;
  message: string;
}

const TOAST_MS = 3200;

let toastCount = 0;

export interface PageRuntimeOptions {
  page: Page;
  theme: Theme;
  /**
   * What `props` holds for this render.
   *
   * A page has no enclosing component and passes nothing. The studio passes a symbol's
   * *defaults* while that symbol is being edited on its own — a component whose bindings
   * all rendered their fallbacks would be a component nobody could see well enough to
   * build. An instance's real values are supplied further down, by `SymbolInstance`.
   */
  props?: Record<string, Json>;
  /** Where expressions compile. See `evaluate.ts`. */
  realm?: EvalRealm | null;
  /** What a `navigate` step means to the host. See `navigateTo`. */
  onNavigate?: (to: string) => void;
}

export interface PageRuntimeValue {
  scope: RenderScope;
  toasts: readonly Toast[];
  dispatch: (
    node: Node,
    event: string,
    steps: readonly ActionStep[],
    domEvent: unknown,
    scope: RenderScope,
  ) => void;
}

/**
 * Where a `navigate` step goes when the host has not said.
 *
 * An absolute URL is a real destination and is followed. A path is not: inside the
 * preview's frame, assigning `/about` loads *the studio* into the frame, which is the
 * same accident `useDesignLinks` exists to prevent for ordinary links. So a path needs a
 * host that knows what a path means — the preview maps it to a page — and without one it
 * is reported rather than guessed at.
 */
function navigateTo(to: string, onNavigate: ((to: string) => void) | undefined): void {
  // An absolute URL is a destination in its own right, and is followed whether or not
  // there is a host — nobody has to be asked what `https://…` means.
  if (/^[a-z][a-z0-9+.-]*:/i.test(to)) {
    globalThis.location?.assign(to);
    return;
  }

  if (onNavigate) {
    onNavigate(to);
    return;
  }

  console.warn(`[ui-builder] nothing here knows how to navigate to "${to}".`);
}

export function usePageRuntime({
  page,
  theme,
  props,
  realm,
  onNavigate,
}: PageRuntimeOptions): PageRuntimeValue {
  const state = usePageState(page.state);
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  // Passed *into* the queries hook rather than built around it: the scope contains the
  // query states, so only the hook holding them can finish it. See `usePageQueries`.
  const makeScope = useCallback(
    (queries: Record<string, QueryState>): RenderScope => ({
      state: state.values,
      queries,
      props: props ?? NO_PROPS,
      theme,
    }),
    [state.values, props, theme],
  );

  const { scope, run } = usePageQueries(page.queries, makeScope, realm);

  const showToast = useCallback((message: string) => {
    const toast: Toast = { id: (toastCount += 1), message };
    setToasts((current) => [...current, toast]);
    setTimeout(() => {
      setToasts((current) => current.filter((candidate) => candidate.id !== toast.id));
    }, TOAST_MS);
  }, []);

  const dispatch = useCallback(
    (
      node: Node,
      event: string,
      steps: readonly ActionStep[],
      domEvent: unknown,
      nodeScope: RenderScope,
    ) => {
      // The node's own scope, not the page's: inside a `repeat` it carries the `item`
      // this copy was rendered for, which is how "delete this row" knows which row.
      const actionScope = { ...nodeScope, event: domEvent };
      const where = `${node.name} · ${event}`;
      const report = (message: string) => console.warn(`[ui-builder] ${where}: ${message}`);

      const evaluate = createEvaluator(actionScope, {
        realm,
        report: ({ source, message }) => report(`{{ ${source} }} — ${message}`),
      });

      void runSteps(steps, {
        page,
        evaluate,
        setState: state.setValue,
        toggleState: state.toggle,
        runQuery: run,
        navigate: (to) => navigateTo(to, onNavigate),
        toast: showToast,
        runCode: (code) => runStatements(code, actionScope, realm),
        report,
      });
    },
    [page, state.setValue, state.toggle, run, realm, onNavigate, showToast],
  );

  return useMemo(() => ({ scope, toasts, dispatch }), [scope, toasts, dispatch]);
}
