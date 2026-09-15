import { asBoolean, asEnum, asString } from '../spec.js';
import { MODAL_SIZES } from '../specs/Modal.js';
import { Overlay } from './Overlay.js';
import type { RenderedProps } from './props.js';

export interface ModalProps extends RenderedProps {
  title?: string;
  description?: string;
  size?: string;
  showClose?: boolean;
  /** Whether a click on the backdrop, or Escape, dismisses the panel. */
  dismissable?: boolean;
  /** Paints the dimmed backdrop behind the panel. */
  dim?: boolean;
  /**
   * Whether the panel is on screen.
   *
   * The document's own `open` prop is the *initial* value and is read by whoever owns the
   * page's overlay state — the renderer on the canvas, a `useState` in an export. What
   * arrives here is that state's current answer, which is why this is a resolved boolean
   * rather than something to coerce.
   */
  open?: boolean;
  onClose?: () => void;
}

/**
 * A dialog — a dimmed stage with a panel centred in it.
 *
 * It renders in normal flow rather than pinned to the viewport, which is the decision the
 * spec explains: a fixed overlay would cover the page being designed and sit outside every
 * rect the canvas hit-tests, so it would be a component nobody could select. Pinning it is
 * a `position` and an `inset` in the Design tab, and both land on this root element.
 *
 * The body is children while the title and the description are props, the same split
 * `Card` and `ChatMessage` make: the heading of a dialog is a line someone types, and what
 * the dialog contains is a subtree they assemble.
 */
export function Modal({
  title,
  description,
  size,
  showClose,
  dismissable,
  dim,
  open,
  onClose,
  className,
  children,
  ...rest
}: ModalProps) {
  const heading = asString(title);
  const detail = asString(description);
  const closable = asBoolean(showClose, true);
  const dismissible = asBoolean(dismissable, true);
  const dimmed = asBoolean(dim, true);

  return (
    <Overlay
      open={open}
      onClose={onClose}
      className={['ub-modal', className].filter(Boolean).join(' ')}
      data-size={asEnum(size, MODAL_SIZES, 'md')}
      data-dim={dimmed ? '' : undefined}
      data-dismissable={dismissible ? '' : undefined}
      {...rest}
    >
      {dimmed ? (
        <div
          className="ub-modal-backdrop"
          aria-hidden="true"
          data-close={dismissible ? '' : undefined}
        />
      ) : null}
      <div className="ub-modal-panel" role="dialog" aria-modal="true">
        {heading === '' && detail === '' && !closable ? null : (
          <div className="ub-modal-header">
            {heading === '' && detail === '' ? null : (
              <div className="ub-modal-heading">
                {heading === '' ? null : <h2 className="ub-modal-title">{heading}</h2>}
                {detail === '' ? null : <p className="ub-modal-description">{detail}</p>}
              </div>
            )}
            {closable ? (
              <button type="button" className="ub-modal-close" aria-label="Close" data-close="">
                ×
              </button>
            ) : null}
          </div>
        )}
        <div className="ub-modal-body">{children}</div>
      </div>
    </Overlay>
  );
}
