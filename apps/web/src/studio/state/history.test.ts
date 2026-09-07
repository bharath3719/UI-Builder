import { describe, expect, it } from 'vitest';
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  resetHistory,
  undo,
} from './history.js';

/** The history is generic, so a number is a document as far as it is concerned. */
const at = (n: number) => ({ at: n });

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const history = createHistory('a');

    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('walks back and forward through pushed states', () => {
    let history = createHistory(0);
    history = pushHistory(history, 1);
    history = pushHistory(history, 2);

    expect(history.present).toBe(2);

    history = undo(history);
    expect(history.present).toBe(1);
    history = undo(history);
    expect(history.present).toBe(0);
    expect(canUndo(history)).toBe(false);

    history = redo(history);
    expect(history.present).toBe(1);
    history = redo(history);
    expect(history.present).toBe(2);
    expect(canRedo(history)).toBe(false);
  });

  it('ignores a push of the value already present', () => {
    // Every `schema/ops` function returns the page it was given when the operation was
    // a no-op, and an undo step that changes nothing is worse than no step at all.
    const history = pushHistory(createHistory('a'), 'a');

    expect(canUndo(history)).toBe(false);
  });

  it('does nothing when there is no past or future to move into', () => {
    const history = createHistory('a');

    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it('drops the redo branch when a new edit arrives', () => {
    let history = createHistory(0);
    history = pushHistory(history, 1);
    history = undo(history);
    history = pushHistory(history, 9);

    expect(canRedo(history)).toBe(false);
    expect(history.present).toBe(9);
  });

  describe('coalescing', () => {
    it('merges edits sharing a key inside the window into one step', () => {
      let history = createHistory(0);
      history = pushHistory(history, 1, { coalesce: 'width', ...at(1000) });
      history = pushHistory(history, 2, { coalesce: 'width', ...at(1100) });
      history = pushHistory(history, 3, { coalesce: 'width', ...at(1200) });

      expect(history.present).toBe(3);
      // One step, so undo lands on the state before the whole gesture.
      expect(undo(history).present).toBe(0);
    });

    it('starts a new step once the window has passed', () => {
      let history = createHistory(0);
      history = pushHistory(history, 1, { coalesce: 'width', ...at(1000) });
      history = pushHistory(history, 2, { coalesce: 'width', ...at(1000 + COALESCE_MS) });

      expect(undo(history).present).toBe(1);
    });

    it('starts a new step for a different key', () => {
      let history = createHistory(0);
      history = pushHistory(history, 1, { coalesce: 'width', ...at(1000) });
      history = pushHistory(history, 2, { coalesce: 'height', ...at(1010) });

      expect(undo(history).present).toBe(1);
    });

    it('never merges into a state reached by undoing', () => {
      let history = createHistory(0);
      history = pushHistory(history, 1, { coalesce: 'width', ...at(1000) });
      history = pushHistory(history, 2, { coalesce: 'width', ...at(1010) });
      history = undo(history);

      // Redoing the merged step landed on 0; an edit now must not swallow it.
      history = pushHistory(history, 5, { coalesce: 'width', ...at(1020) });

      expect(undo(history).present).toBe(0);
    });

    it('always starts a new step without a key', () => {
      let history = createHistory(0);
      history = pushHistory(history, 1, at(1000));
      history = pushHistory(history, 2, at(1001));

      expect(undo(history).present).toBe(1);
    });
  });

  it('undoes and redoes 200 edits cleanly', () => {
    // Phase 8's acceptance criterion, exactly: 200 edits, all the way back and forward.
    let history = createHistory(0);
    for (let i = 1; i <= 200; i += 1) history = pushHistory(history, i);

    for (let i = 199; i >= 0; i -= 1) {
      history = undo(history);
      expect(history.present).toBe(i);
    }

    for (let i = 1; i <= 200; i += 1) {
      history = redo(history);
      expect(history.present).toBe(i);
    }
  });

  it('drops the oldest states past the limit', () => {
    let history = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 50; i += 1) history = pushHistory(history, i);

    expect(history.past).toHaveLength(HISTORY_LIMIT);
    // The 50 oldest went; the boundary is the first one still reachable.
    expect(history.past[0]).toBe(50);
  });

  it('forgets everything on a reset', () => {
    const edited = pushHistory(createHistory(0), 1);
    const reset = resetHistory(99);

    expect(canUndo(edited)).toBe(true);
    expect(reset.present).toBe(99);
    expect(canUndo(reset)).toBe(false);
    expect(canRedo(reset)).toBe(false);
  });
});
