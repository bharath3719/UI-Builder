import { asBoolean, asEnum, asString } from '../spec.js';
import { DRAWER_SIDES, DRAWER_SIZES } from '../specs/Drawer.js';
import { Overlay } from './Overlay.js';
import type { RenderedProps } from './props.js';

export interface DrawerProps extends RenderedProps {
  title?: string;
  side?: string;
  size?: string;
  showClose?: boolean;
  /** Whether a click on the backdrop, or Escape, dismisses the panel. */
  dismissable?: boolean;
  dim?: boolean;
  /** The page's current answer, not the document's initial one. See `ModalProps.open`. */
  open?: boolean;
  onClose?: () => void;
}

/**
 * A panel anchored to one edge of its stage.
 *
 * `Modal` with the panel pushed into a corner instead of centred, and in flow for the same
 * reason. One `side` moves the panel, which edge is rounded and which measurement `size`
 * means — a design that set those by hand would have four declarations to revisit every
 * time it changed its mind about which edge the drawer comes from.
 */
export function Drawer({
  title,
  side,
  size,
  showClose,
  dismissable,
  dim,
  open,
  onClose,
  className,
  children,
  ...rest
}: DrawerProps) {
  const heading = asString(title);
  const closable = asBoolean(showClose, true);
  const dismissible = asBoolean(dismissable, true);
  const dimmed = asBoolean(dim, true);

  return (
    <Overlay
      open={open}
      onClose={onClose}
      className={['ub-drawer', className].filter(Boolean).join(' ')}
      data-side={asEnum(side, DRAWER_SIDES, 'right')}
      data-size={asEnum(size, DRAWER_SIZES, 'md')}
      data-dim={dimmed ? '' : undefined}
      data-dismissable={dismissible ? '' : undefined}
      {...rest}
    >
      {dimmed ? (
        <div
          className="ub-drawer-backdrop"
          aria-hidden="true"
          data-close={dismissible ? '' : undefined}
        />
      ) : null}
      <div className="ub-drawer-panel" role="dialog" aria-modal="true">
        {heading === '' && !closable ? null : (
          <div className="ub-drawer-header">
            {heading === '' ? null : <h2 className="ub-drawer-title">{heading}</h2>}
            {closable ? (
              <button type="button" className="ub-drawer-close" aria-label="Close" data-close="">
                ×
              </button>
            ) : null}
          </div>
        )}
        <div className="ub-drawer-body">{children}</div>
      </div>
    </Overlay>
  );
}
