import { asBoolean, asNumber } from '../spec.js';
import { valueBinding, type RenderedProps } from './props.js';

export interface SliderProps extends RenderedProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Supplied by the renderer for Form components; it belongs on the control. */
  readOnly?: boolean;
}

/**
 * A native range input, restyled.
 *
 * The track and the thumb are the browser's, reached through the vendor pseudo-elements
 * — `appearance: none` plus `::-webkit-slider-thumb` and `::-moz-range-thumb` in
 * `css.ts`. A pair of divs and a pointer handler would have looked the same and lost the
 * arrow keys, Home/End, the touch target and the form value, which is the whole of what
 * a slider is for.
 *
 * There is no visible number beside it on purpose: a slider that must show its value is
 * a slider and a `Text`, and the second one is a node the user can place, style and bind
 * where they want rather than a layout this component would have to guess.
 */
export function Slider({
  value,
  min,
  max,
  step,
  disabled,
  className,
  children: _children,
  readOnly,
  ...rest
}: SliderProps) {
  const isDisabled = asBoolean(disabled);
  const low = asNumber(min, 0);
  const high = asNumber(max, 100);
  // A range input ignores `readOnly` — what pins the thumb on the canvas is the
  // controlled value React writes back after every drag.
  const binding = valueBinding(asNumber(value, low), readOnly);

  return (
    <input
      type="range"
      className={['ub-slider', className].filter(Boolean).join(' ')}
      min={low}
      max={high}
      step={asNumber(step, 1)}
      {...binding}
      disabled={isDisabled}
      data-disabled={isDisabled ? '' : undefined}
      {...rest}
    />
  );
}
