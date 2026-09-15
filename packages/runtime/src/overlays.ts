/**
 * Which overlays on the page are open — PLAN.md §10.
 *
 * An overlay's `open` prop is where it *starts*; this is what it has become since. The
 * two are kept apart deliberately: the prop is part of the document and survives a reload,
 * while this is page state that a reload throws away, exactly like a state variable's
 * initial value and its current one. Codegen writes the same split as a `useState` seeded
 * from the prop, which is what makes the canvas, the preview and the export agree (D6).
 *
 * Keyed by node id, which has one consequence worth stating: an overlay inside a `repeat`
 * is one node drawn several times, so opening it opens every copy. Naming the copy would
 * mean a step that carries an item as well as a node, and a modal per row is better served
 * by one modal outside the repeat reading the row it was opened for out of a state
 * variable.
 */

import { useCallback, useMemo, useState } from 'react';

export interface OverlayRuntime {
  /** `initial` is the node's own `open` prop, used until something has said otherwise. */
  isOpen: (nodeId: string, initial: boolean) => boolean;
  open: (nodeId: string) => void;
  close: (nodeId: string) => void;
}

export function usePageOverlays(): OverlayRuntime {
  // Absent rather than false: a node with no entry has never been touched, which is what
  // lets `initial` still decide. Storing every overlay as `false` up front would need the
  // set of overlays, which only the render knows.
  const [opened, setOpened] = useState<Readonly<Record<string, boolean>>>({});

  const set = useCallback((nodeId: string, value: boolean) => {
    setOpened((current) => (current[nodeId] === value ? current : { ...current, [nodeId]: value }));
  }, []);

  const isOpen = useCallback(
    (nodeId: string, initial: boolean) => opened[nodeId] ?? initial,
    [opened],
  );

  const open = useCallback((nodeId: string) => set(nodeId, true), [set]);
  const close = useCallback((nodeId: string) => set(nodeId, false), [set]);

  return useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
}
