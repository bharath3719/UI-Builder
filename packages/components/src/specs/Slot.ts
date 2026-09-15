import type { ComponentSpec } from '../spec.js';

/**
 * The node type a slot is. Exported as a constant because four subsystems branch on it —
 * the renderer, the code generator, the palette and the drag rules — and a string literal
 * repeated at each of them is the way one of them quietly stops agreeing.
 */
export const SLOT_TYPE = 'Slot';

/**
 * Where a placement's own content goes — PLAN.md §12's slots, the piece that turns a
 * component you can *configure* into one you can *fill*.
 *
 * **It renders no element of its own, ever.** A slot is a hole, not a box: the export
 * emits `{children}` at this position, which is what a person writing the component by
 * hand would write, and a wrapper here would be a div in the middle of someone's flex row
 * that exists only because the builder needed somewhere to hang an id. That is the same
 * argument `SymbolInstance` settles the other way round — an instance *is* the element its
 * root renders, and a slot *is* the gap between its siblings.
 *
 * The consequence is that the canvas has to draw something while the component itself is
 * being authored, because a hole with nothing in it cannot be selected or dropped into.
 * It does, and that drawing is editor chrome rather than markup: the rule lives in
 * `EMPTY_CONTAINER_CSS` beside the dashed empty-container border rather than in
 * `COMPONENT_CSS`, which is the structural proof it can never reach an export. See
 * `PageRenderer`, which is where the three cases are told apart.
 *
 * **Its children are the fallback**, in React's own sense: what shows when a placement
 * passes nothing. Codegen writes exactly that — `{children ?? (…)}` — so a component
 * dropped with no content looks on the page like it looked while it was being built,
 * rather than collapsing to nothing and reading as broken.
 *
 * `symbolOnly` keeps it out of the palette on a page, where it would be a hole in
 * something that is never placed inside anything and so could never be filled.
 */
export const SlotSpec: ComponentSpec = {
  key: SLOT_TYPE,
  displayName: 'Slot',
  category: 'Layout',
  icon: 'SquareDashed',
  keywords: ['slot', 'children', 'content', 'outlet', 'hole', 'placeholder', 'fill'],
  description: 'Where a placement’s own content goes. Anything inside it is the fallback.',

  props: [],
  // No events: a slot is a position rather than an element, so there is nothing for a
  // handler to be attached to — whatever lands in it brings its own.
  events: [],
  acceptsChildren: true,
  symbolOnly: true,

  defaultProps: {},
  // None, for `symbolSpec`'s reason one level down: a slot renders no element, so there is
  // nothing for a style to land on. The Design tab says so rather than offering controls
  // that would write rules no selector could ever match.
  defaultStyles: {},

  codegen: {
    // Nominal, and never reached: `walkNode` special-cases a slot into `{children}` before
    // any template is expanded, exactly as it special-cases a symbol instance. The field is
    // required by the type and a `div` is the honest answer to "what element is this" for a
    // reader who finds it.
    tag: 'div',
  },
};
