/**
 * Binding one CSS property to the active breakpoint/state cell.
 *
 * This is the only place that knows how a control's text becomes a declaration and
 * how a resolved declaration becomes a control's value. Every Design field is built
 * on it, so the override dot, the inherited placeholder and the reset behave
 * identically everywhere rather than being re-implemented per section.
 */

import { resolveDecl } from '@ui-builder/schema';
import { useStudio } from '../state/context.js';

/**
 * Text from a field to a declaration value.
 *
 * A bare number becomes a number, so the serializer appends `px` — the same rule the
 * renderer uses, which is why typing `16` means 16 pixels on the canvas and in the
 * export both. Anything else stays a string, which is what lets `auto`, `50%`, `2rem`
 * and `var(--space-4)` go into the same field. Empty clears the property rather than
 * writing an empty declaration.
 */
export function parseDeclValue(text: string): string | number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  return /^-?\d*\.?\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

export interface StyleFieldState {
  /**
   * The value written in the cell being edited, as text. Empty when it is not set
   * here — and empty for a selection whose members disagree, because there is no one
   * value to show and putting one of them in the box would invite the user to press
   * Enter and silently flatten the others.
   */
  value: string;
  /** The value that would apply if this cell said nothing. Empty when it varies. */
  inherited: string;
  /** More than one node is selected and they do not all say the same thing here. */
  mixed: boolean;
  /** What the control shows when it has no value of its own. */
  placeholder: string;
  /** Any selected node writes this property in this cell — what the reset dot means. */
  overridden: boolean;
  set: (text: string) => void;
  reset: () => void;
}

const UNBOUND: StyleFieldState = {
  value: '',
  inherited: '',
  mixed: false,
  placeholder: '',
  overridden: false,
  set: () => {},
  reset: () => {},
};

/** The word a field shows in place of a value the selection does not agree on. */
export const MIXED_PLACEHOLDER = 'Mixed';

/**
 * Binds one CSS property to the active cell, across the whole selection.
 *
 * `value` is deliberately empty unless the declaration was written *here*: a field
 * that showed an inherited value as its own content would make every breakpoint look
 * fully specified, and there would be no way to tell a value that is set from one
 * that merely applies. The inherited value goes in the placeholder instead, which is
 * greyed — and typing over it is what takes the property over.
 *
 * With several nodes selected the same field describes all of them at once. Where they
 * agree it behaves exactly as it does for one; where they do not, it says so and stays
 * empty. Writing to it still writes to every one of them — which is the point of
 * selecting several — so "Mixed" is a statement about what is there now, not a refusal.
 */
export function useStyleField(property: string): StyleFieldState {
  const { page, theme, selectedIds, cell, setStyle } = useStudio();

  const nodes = selectedIds.flatMap((id) => page.nodes[id] ?? []);
  if (nodes.length === 0) return UNBOUND;

  const owns = nodes.map((node) => node.styles[cell.breakpoint]?.[cell.state]?.[property]);
  // Resolved without this cell's own answer, so the placeholder shows what a reset
  // would fall back to rather than echoing the value beside it.
  const inheriteds = nodes.map((node) => {
    const resolved = resolveDecl(node, theme, cell, property);
    return resolved.origin === 'inherited' ? String(resolved.value) : '';
  });

  const agrees = <T>(values: T[]) => values.every((value) => value === values[0]);

  const own = agrees(owns) ? owns[0] : undefined;
  const mixed = !agrees(owns);
  const inherited = agrees(inheriteds) ? (inheriteds[0] ?? '') : '';

  return {
    value: own === undefined ? '' : String(own),
    inherited,
    mixed,
    placeholder: mixed ? MIXED_PLACEHOLDER : inherited,
    overridden: owns.some((value) => value !== undefined),
    set: (text) => setStyle({ [property]: parseDeclValue(text) }),
    reset: () => setStyle({ [property]: undefined }),
  };
}
