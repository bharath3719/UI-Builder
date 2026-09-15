/**
 * The `data-ub-*` attributes the editor puts on a rendered node.
 *
 * Their own module because two things need them and neither should import the other: the
 * renderer writes them, and a node's error boundary has to keep the hit-test attribute on
 * its fallback — a node that failed to render is exactly the one someone needs to select
 * in order to fix it.
 *
 * None of them survive `editing: false`, so nothing here reaches the preview or the
 * export.
 */

/** Attribute the canvas hit-tests against to turn a DOM element back into a node. */
export const NODE_ID_ATTRIBUTE = 'data-ub-id';

/** Set when an expression on the node failed; its value is the message. */
export const NODE_ERROR_ATTRIBUTE = 'data-ub-error';

/**
 * Set when the data says this node should not be on screen at all — a false `showIf`, or
 * a `repeat` over an empty list. Its value is why.
 */
export const NODE_INACTIVE_ATTRIBUTE = 'data-ub-inactive';

/**
 * Set on the frame's root element while the node under the pointer is one the canvas would
 * pick up — see `Canvas.tsx`, which owns the question.
 *
 * A cursor rather than an outline, and on the *document* rather than on the node, for one
 * reason: the studio's own stylesheet stops at the iframe, so the only way the design can
 * say "this is draggable" is a rule inside the frame — and the studio is the only side that
 * knows whether it is. The page root and a locked node are deliberately excluded there: the
 * one has nowhere to move to and the other is pinned, and a hand over either is a promise
 * the canvas would then refuse.
 */
export const DRAG_READY_ATTRIBUTE = 'data-ub-grab';

/**
 * Editor chrome for the two above.
 *
 * It lives with the runtime rather than with the component library's CSS because it
 * describes the runtime's own reporting rather than any component — and it is emitted
 * only while editing, like `EMPTY_CONTAINER_CSS` beside it.
 *
 * Outlines rather than borders or backgrounds: an outline takes no space, so a node
 * wearing one is laid out exactly as it will ship. The message rides on `title` as well,
 * which is what makes it readable on a void element that can have no `::after`.
 */
export const NODE_STATUS_CSS = `[${NODE_ERROR_ATTRIBUTE}] {
  outline: 1px solid hsl(0 72% 51%);
  outline-offset: 1px;
}

[${NODE_INACTIVE_ATTRIBUTE}] {
  opacity: 0.45;
  outline: 1px dashed hsl(220 9% 60%);
  outline-offset: 1px;
}`;

/**
 * The open hand, while the design is being edited.
 *
 * The descendant half is load-bearing rather than belt-and-braces: `cursor` inherits, but a
 * component that sets its own — `.ub-button` is `pointer`, `.ub-select` is too — would
 * otherwise keep it, and a button is exactly the kind of thing someone drags around a page.
 * Two selectors of weight against the library's one, so this wins without `!important`.
 *
 * Editor-only, like the two rules above: `editing: false` emits none of this, so a shipped
 * page carries no cursor it did not ask for.
 */
export const CANVAS_CURSOR_CSS = `:root[${DRAG_READY_ATTRIBUTE}],
:root[${DRAG_READY_ATTRIBUTE}] * {
  cursor: grab;
}`;
