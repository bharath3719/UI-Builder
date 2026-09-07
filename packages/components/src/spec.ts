/**
 * The component spec — PLAN.md §7, decision D7.
 *
 * One object per component, and every subsystem reads it rather than keeping its own
 * list: the palette renders `displayName`/`icon`/`category`, search indexes
 * `keywords`, the inspector generates its controls from `props`, the renderer mounts
 * the implementation this key names, drag-and-drop consults `acceptsChildren`, and
 * codegen emits `codegen`.
 *
 * **This file, and everything it reaches, is data.** No React, no lucide, no DOM — a
 * spec describes a component rather than being one, so the API and the code generator
 * can read the whole registry without a UI framework coming with it. The React
 * implementations and the palette's icons live behind `@ui-builder/components/react`
 * and are joined back to a spec by `key`. See `react/implementations.ts`.
 */

import { isTruthy, stringifyValue, type Json, type StyleDecls } from '@ui-builder/schema';
import type { EmitElement } from './emit.js';

export type ComponentCategory =
  'Symbols' | 'Layout' | 'Basic' | 'Form' | 'Data' | 'Media' | 'AI' | 'Overlay';

/**
 * `Symbols` is first because it is the document's own — a project that has built a card
 * reaches for that card before it reaches for a Box, and a group that is empty in a new
 * project costs nothing to put at the top (`specsByCategory` drops empty groups).
 *
 * `AI` sits after the primitives and before `Overlay` because it is the one group whose
 * members are *compositions* — a chat message is an avatar, a name and a bubble that a
 * user could have assembled from `Basic` by hand. Reading down the palette therefore
 * still goes from smaller to larger, which is the order someone builds in.
 */
export const CATEGORY_ORDER: readonly ComponentCategory[] = [
  'Symbols',
  'Layout',
  'Basic',
  'Form',
  'Data',
  'Media',
  'AI',
  'Overlay',
];

export interface EnumOption {
  label: string;
  value: string;
}

export type PropSpec =
  | {
      name: string;
      label: string;
      type: 'string' | 'text' | 'number' | 'boolean' | 'color' | 'url';
      placeholder?: string;
    }
  | { name: string; label: string; type: 'enum'; options: EnumOption[] };

export interface ComponentSpec {
  /** Stable registry key, stored in the document and emitted by codegen. */
  key: string;
  displayName: string;
  category: ComponentCategory;
  /**
   * The name of a lucide icon, not the icon itself — a `LucideIcon` is a React
   * component, and holding one here would put React and lucide in every bundle that
   * reads a spec, the API's included.
   *
   * `react/implementations.ts` maps the name to the imported icon, and a test fails the
   * build when a spec names one that is not wired up. A plain `string` rather than a
   * union of the wired names so that adding a component stays two files rather than
   * three; the test is what makes that safe.
   */
  icon: string;
  /** Fuzzy-search fuel — the words someone types when they do not know our name. */
  keywords: string[];
  /** One line, shown in the palette on hover and in the empty inspector. */
  description: string;

  props: PropSpec[];
  events: string[];
  acceptsChildren: boolean;
  /** img, input — never takes children, and drops onto it target its parent instead. */
  isVoid?: boolean;

  /**
   * How the component lays its children out, when its own library CSS decides that
   * rather than the document.
   *
   * The inspector needs it: a `VStack` is `display: flex` because of a rule in
   * `css.ts`, not because of anything in the node, so a Design tab that decided which
   * controls to show by reading the node alone would hide `align-items` on exactly
   * the components people set it on. Declaring it here rather than the studio reading
   * it back off the canvas keeps the registry the single source (D7) — and keeps the
   * panel from depending on the iframe having painted.
   */
  layout?: 'flex' | 'grid';

  /**
   * Whether the implementation answers the *reader* — a table whose rows can be dragged
   * into a new order, rather than a picture of one.
   *
   * It is the same fact `isDesignTimeControl` reads off a Form component, stated for the
   * components where the category cannot say it: the canvas has to freeze anything that
   * would otherwise compete for a gesture or hold state the document does not know about.
   * Declared rather than inferred from `codegen.emit` carrying an `EmitModule`, because
   * the two are genuinely different questions — a `<details>` is interactive and ships no
   * JavaScript at all.
   */
  interactive?: boolean;

  defaultProps: Record<string, Json>;
  defaultStyles: StyleDecls;

  codegen: {
    /** Undefined means a plain intrinsic element rather than an imported component. */
    importFrom?: string;
    tag: string;
    /**
     * The markup this component exports as (`emit.ts`).
     *
     * Separate from `tag` because the two answer different questions: `tag` is what
     * element this component fundamentally *is*, which is what a future shadcn emitter
     * swaps for `{ importFrom: '@/components/ui/button', tag: 'Button' }`, while
     * `emit` is the whole tree the CSS-Modules emitter writes — an Avatar is a `span`
     * either way, but it exports as a span wrapping an image or a set of initials.
     *
     * Omitted means the trivial template: `tag`, carrying the node's class and its
     * children. That is a real answer for `Box`, not a missing one.
     */
    emit?: EmitElement;
  };
}

/**
 * Whether the renderer makes this component inert while editing.
 *
 * `Form`, because a design-time click on a field should select the node rather than
 * operate it — and anything that stores a `value` or `checked` prop, because that value
 * belongs to the inspector while editing. The second half is what picks up `PromptInput`,
 * whose textarea is a form control in everything but which palette group it is filed
 * under, and what leaves `Input` — a placeholder and no value — out of it.
 *
 * `interactive` is the third case and the general one: a component that answers the reader
 * has to stop answering while it is being designed. `Table` is why — the gesture that
 * drags one of its rows is the gesture that drags the node.
 *
 * All three arrive at the component as `readOnly`, whose *absence* is how the preview and
 * the export say they are the shipped render (`props.ts`).
 */
export function isDesignTimeControl(spec: ComponentSpec): boolean {
  return (
    spec.category === 'Form' ||
    spec.interactive === true ||
    spec.props.some((prop) => prop.name === 'value' || prop.name === 'checked')
  );
}

/* -------------------------------------------------------------------------- */
/* Coercions                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Narrow a raw prop value to the type its spec declares.
 *
 * Shared by the components, which coerce what they render, and by `codegen`, which
 * coerces what it emits — one copy, because a node has to export as what the canvas
 * rendered (D6) and two functions that agree today are two functions that can stop.
 */
export function asString(value: Json | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asBoolean(value: Json | undefined, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function asNumber(value: Json | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Enum props come out of the document as free strings, and a document can outlive the
 * spec that produced it — a variant removed from the library must not render as a
 * missing class. Anything unrecognised falls back to the first allowed value.
 */
export function asEnum<T extends string>(
  value: Json | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * A *bound* prop's evaluated value, narrowed toward the type its spec declares.
 *
 * Static props never come through here — the inspector already wrote them as the right
 * type. An expression can produce anything, and the coercion applied to what it produced
 * has to be the one the exported JSX would apply, or one binding renders two ways (D6).
 * `{{ state.count }}` on a text prop is `"3"` in the export, because JSX stringifies a
 * number; without this it would be the component's fallback here, since `asString` quite
 * correctly refuses a number. Truthiness is the same argument for booleans: React treats
 * `disabled={"yes"}` as disabled, so this does too.
 *
 * `undefined` means "as if the prop were not set", which is what a binding reading a
 * query that has not answered yet should mean.
 */
export function coerceToProp(value: unknown, prop: PropSpec): Json | undefined {
  if (value === undefined || value === null) return undefined;

  switch (prop.type) {
    case 'number': {
      const numeric = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numeric) ? numeric : undefined;
    }
    case 'boolean':
      return isTruthy(value);
    default:
      // Enums included: a string that is not one of the options is still a string, and
      // `asEnum` is the thing that decides what to do about that.
      return typeof value === 'string' ? value : stringifyValue(value);
  }
}
