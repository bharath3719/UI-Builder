/**
 * What the renderer hands a component, and how a stored value becomes a live one.
 *
 * React-side only: a spec is data (`spec.ts`) and says nothing about React, so
 * everything here — the props the renderer adds, and the controlled/uncontrolled switch
 * the canvas depends on — lives with the implementations that use it.
 */

import type { ReactNode } from 'react';

/**
 * Props the renderer supplies to every component on top of its own: the class name
 * carrying the node's styles, its children, and the `data-ub-*` attributes the canvas
 * hit-tests against. Every component spreads the rest onto its root element, which is
 * what makes a node selectable on the canvas without the component knowing about the
 * editor at all.
 */
export interface RenderedProps {
  className?: string;
  children?: ReactNode;
  [attribute: string]: unknown;
}

/**
 * A control's value belongs to the *document* while editing and to the *user* everywhere
 * else, and that is the difference between the canvas and the preview.
 *
 * On the canvas it has to be controlled with no `onChange`, so that typing a value into
 * the inspector shows at once and a stray click cannot drift the two apart; `readOnly` is
 * what makes that legal rather than a React warning. In the preview and the export there
 * is no inspector to stay in sync with — the stored value is where the field *starts*,
 * which is `defaultValue`, and is exactly what codegen emits. A field left controlled
 * there is a field that cannot be typed into, and a `<input type="date">` left `readOnly`
 * is one whose calendar will not open.
 *
 * The renderer supplies `readOnly` only while `editing`, so its absence is the signal
 * that this render is the shipped one.
 */
export function valueBinding(
  value: string | number,
  readOnly: boolean | undefined,
): { value: string | number; readOnly: true } | { defaultValue: string | number } {
  return readOnly ? { value, readOnly: true } : { defaultValue: value };
}

/** `valueBinding` for the checked controls — checkbox, switch, radio. */
export function checkedBinding(
  checked: boolean,
  readOnly: boolean | undefined,
): { checked: boolean; readOnly: true } | { defaultChecked: boolean } {
  return readOnly ? { checked, readOnly: true } : { defaultChecked: checked };
}

/**
 * `valueBinding` for `select`, which has no `readOnly` attribute to suppress the warning
 * with — an empty handler does the same job.
 */
export function selectBinding(
  value: string,
  readOnly: boolean | undefined,
): { value: string; onChange: () => void } | { defaultValue: string } {
  return readOnly ? { value, onChange: () => {} } : { defaultValue: value };
}
