import { asBoolean, asEnum, asString } from '../spec.js';
import { TOOLTIP_SIDES } from '../specs/Tooltip.js';
import type { RenderedProps } from './props.js';

export interface TooltipProps extends RenderedProps {
  label?: string;
  side?: string;
  /** Pins the bubble open — for designing it, and for shipping it that way. */
  visible?: boolean;
}

/**
 * A hint wrapped around whatever is dropped inside it.
 *
 * The bubble is shown by CSS — `:hover` and `:focus-within` on this wrapper — so there is
 * no state, no positioning library, and the exported page carries no JavaScript for it.
 * The keyboard half is `:focus-within`, which is why the trigger has to *contain* what it
 * describes rather than sit beside it.
 */
export function Tooltip({ label, side, visible, className, children, ...rest }: TooltipProps) {
  const text = asString(label);

  return (
    <span
      className={['ub-tooltip', className].filter(Boolean).join(' ')}
      data-side={asEnum(side, TOOLTIP_SIDES, 'top')}
      data-visible={asBoolean(visible) ? '' : undefined}
      {...rest}
    >
      <span className="ub-tooltip-trigger">{children}</span>
      {text === '' ? null : (
        <span className="ub-tooltip-bubble" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
