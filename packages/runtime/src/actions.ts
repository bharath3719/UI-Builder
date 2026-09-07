/**
 * The action interpreter — PLAN.md §10.
 *
 * A handler is a list of steps from a closed union, run in order. Small enough that the
 * generated code is a readable handler body rather than a shipped copy of this file,
 * which is the whole reason the union is closed (§10, "not an interpreter shipped to the
 * user").
 *
 * **Steps see the scope as it was when the event fired**, not as it becomes while they
 * run — a `setState` followed by an expression reading that variable reads the old value.
 * That is not a limitation worked around; it is React, and it is what the exported
 * handler will do with its own `useState`. Making it true here is D6 for behaviour: what
 * the preview does is what the export does. Writes themselves compose correctly (two
 * toggles are two flips), because those go through the reducer rather than the scope.
 */

import type { ActionStep, EvaluateExpression, Json, Page, PropValue } from '@ui-builder/schema';
import { evaluateProp, stringifyValue } from '@ui-builder/schema';

/**
 * Everything a step can do, supplied by the runtime. An interface rather than direct
 * calls so the interpreter itself is pure and testable without a DOM, a fetch or React.
 */
export interface ActionHost {
  page: Page;
  /** Bound to the node's scope with `event` added. */
  evaluate: EvaluateExpression;
  setState: (id: string, value: Json) => void;
  toggleState: (id: string) => void;
  runQuery: (id: string) => Promise<void>;
  navigate: (to: string) => void;
  toast: (message: string) => void;
  runCode: (code: string) => void;
  /** Said out loud rather than thrown — a broken handler must not take the page down. */
  report: (message: string) => void;
}

/**
 * An evaluated value, narrowed to something a state variable can hold.
 *
 * An expression can produce anything — a function, an event, `NaN` — and `state` is
 * serialized into the document's neighbours and read by codegen, so it has to stay JSON.
 * Objects and arrays pass through unexamined: policing them deeply would mean a walk on
 * every keystroke, and the failure mode of storing an exotic object is a render that
 * looks wrong, not a document that cannot be saved.
 */
export function asJson(value: unknown): Json {
  if (value === null) return null;

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'object':
      return value as Json;
    default:
      return null;
  }
}

/** A step's text argument — a path to navigate to, a message to show. */
function textOf(prop: PropValue, evaluate: EvaluateExpression): string {
  return stringifyValue(evaluateProp(prop, evaluate));
}

async function runStep(step: ActionStep, host: ActionHost): Promise<void> {
  switch (step.kind) {
    case 'setState': {
      if (!host.page.state.some((variable) => variable.id === step.stateId)) {
        host.report('sets a variable that no longer exists');
        return;
      }
      host.setState(step.stateId, asJson(evaluateProp(step.value, host.evaluate)));
      return;
    }

    case 'toggleState': {
      if (!host.page.state.some((variable) => variable.id === step.stateId)) {
        host.report('toggles a variable that no longer exists');
        return;
      }
      host.toggleState(step.stateId);
      return;
    }

    case 'runQuery': {
      if (!host.page.queries.some((query) => query.id === step.queryId)) {
        host.report('runs a query that no longer exists');
        return;
      }
      // Awaited, so that a step after it — a toast, a navigation — happens after the
      // request rather than beside it. That ordering is the only reason a step list is
      // sequential at all.
      await host.runQuery(step.queryId);
      return;
    }

    case 'navigate': {
      const to = textOf(step.to, host.evaluate);
      if (to === '') {
        host.report('navigates nowhere');
        return;
      }
      host.navigate(to);
      return;
    }

    case 'showToast': {
      host.toast(textOf(step.message, host.evaluate));
      return;
    }

    case 'custom': {
      host.runCode(step.code);
      return;
    }
  }
}

/**
 * Runs a handler.
 *
 * A failing step stops the ones after it, because that is what a throw in the generated
 * handler body would do — and because a sequence that saves and then navigates should not
 * navigate when the save threw. The failure is reported, never rethrown: an exception
 * escaping a React event handler is an unhandled rejection, and the author's mistake in
 * one button must not be the page's problem.
 */
export async function runSteps(steps: readonly ActionStep[], host: ActionHost): Promise<void> {
  for (const [index, step] of steps.entries()) {
    try {
      await runStep(step, host);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      host.report(`step ${index + 1} (${step.kind}) failed: ${message}`);
      return;
    }
  }
}
