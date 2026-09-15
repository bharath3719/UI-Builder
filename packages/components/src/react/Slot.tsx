import type { RenderedProps } from './props.js';

/**
 * The authoring box a slot draws on the canvas — and nowhere else.
 *
 * `PageRenderer` reaches for this component in exactly one case: the component is being
 * *authored*, so nothing is flowing into the slot and there is no placement to take
 * content from. Every other case renders the slot's contents directly with no element at
 * all (see `SlotSpec`), which is what keeps the export free of a wrapper.
 *
 * So this is editor chrome that happens to be a component, and `ub-slot` is styled in
 * `EMPTY_CONTAINER_CSS` — the sheet the canvas loads and the export does not — rather than
 * in `COMPONENT_CSS`. A rule for it in the library's own stylesheet would ship to a
 * stranger's project as dead weight, and worse, would suggest this element exists there.
 *
 * `children` is the fallback the author is building, and it renders inside the box so that
 * what they are arranging is the thing a placement with no content will show.
 *
 * The node's own `className` is deliberately *dropped* rather than joined. A slot renders
 * no element in the export, so a rule written against it has no selector to match there —
 * wearing the class here would make those rules appear to work on the canvas and then do
 * nothing once shipped, which is the one failure D6 exists to prevent. The inspector
 * refuses to write them in the first place; this is the half that holds even for a document
 * that already carries some.
 */
export function Slot({ className: _className, children, ...rest }: RenderedProps) {
  return (
    <div className="ub-slot" {...rest}>
      {children}
    </div>
  );
}
