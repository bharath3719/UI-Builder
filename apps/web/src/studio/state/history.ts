/**
 * Undo/redo — PLAN.md §12, Phase 8.
 *
 * A stack of whole documents rather than a stack of patches. The plan reached for
 * Immer's `produceWithPatches`, and the reason this does not is that `schema/ops` was
 * already written pure: every operation returns a new `Page` that shares every node it
 * did not touch, so a snapshot costs one object per changed node and undo is an
 * assignment. Patches would buy a smaller history and cost an inverse-patch
 * implementation, a second code path for every mutation, and a class of bug — a wrong
 * inverse — that snapshots cannot have.
 *
 * The type is generic and knows nothing about documents, which is what makes it
 * testable without React or a page.
 */

/** How many snapshots to keep. Phase 8's acceptance is 200 edits; this is comfortably past it. */
export const HISTORY_LIMIT = 500;

/**
 * How long two edits sharing a coalesce key stay one undo step.
 *
 * Deliberately short. The inspector already commits on blur and Enter rather than per
 * keystroke, so this is not the thing standing between an undo stack and one entry per
 * character — it is for the controls that genuinely stream, a colour picker being
 * dragged or an arrow key held down on a length field.
 */
export const COALESCE_MS = 700;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /**
   * What produced `present`, and when. Only ever read to decide whether the *next*
   * edit joins it; `undefined` for a state nothing can merge into, which is what makes
   * an undo followed by an edit always a fresh step.
   */
  lastEdit: { key: string; at: number } | undefined;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastEdit: undefined };
}

export interface PushOptions {
  /**
   * Edits sharing a key within {@link COALESCE_MS} collapse into one undo step. Omit
   * for an edit that is always its own step — a drop, a delete, a paste.
   */
  coalesce?: string;
  /** Injectable for tests; defaults to now. */
  at?: number;
}

/**
 * Records a new present.
 *
 * Returns the history unchanged when the value did not: every mutation in the studio
 * runs through `schema/ops`, which returns the *same* object when an operation was a
 * no-op (a move to where the node already is, a style write of a value already set), and
 * an undo step that changes nothing is worse than no step at all.
 */
export function pushHistory<T>(
  history: History<T>,
  next: T,
  options: PushOptions = {},
): History<T> {
  if (next === history.present) return history;

  const at = options.at ?? Date.now();
  const lastEdit = options.coalesce === undefined ? undefined : { key: options.coalesce, at };

  const merges =
    options.coalesce !== undefined &&
    history.lastEdit !== undefined &&
    history.lastEdit.key === options.coalesce &&
    at - history.lastEdit.at < COALESCE_MS;

  if (merges) {
    // Replace the present in place: the step already on the stack is the one that
    // predates the whole gesture, which is what undo should land on.
    return { ...history, present: next, future: [], lastEdit };
  }

  const past = [...history.past, history.present];

  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    // Any new edit abandons the redo branch. Keeping it would mean redo could jump to a
    // state that never followed from what is now on screen.
    future: [],
    lastEdit,
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    // Nothing may coalesce into a state that was reached by undoing.
    lastEdit: undefined,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;

  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
    lastEdit: undefined,
  };
}

/**
 * Replaces the whole history with one that starts at `present`.
 *
 * For the two moments the past stops being reachable: a document loaded from the server,
 * and a conflict resolved by taking the other side. Undoing across either would restore
 * a document the server has never heard of.
 */
export function resetHistory<T>(present: T): History<T> {
  return createHistory(present);
}
