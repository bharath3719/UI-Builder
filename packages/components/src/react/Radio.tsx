import { parseOptions } from '../derive.js';
import { asBoolean, asEnum, asString } from '../spec.js';
import { RADIO_ORIENTATIONS } from '../specs/Radio.js';
import { checkedBinding, type RenderedProps } from './props.js';

export interface RadioProps extends RenderedProps {
  /** One option per line. `value | Label` splits the two; a bare line is both. */
  options?: string;
  value?: string;
  /** The shared `name`, which is what makes a set of radios one choice. */
  name?: string;
  orientation?: string;
  disabled?: boolean;
  /** Supplied by the renderer for Form components; it belongs on the controls. */
  readOnly?: boolean;
}

/**
 * A group of radios, authored as text, as one node.
 *
 * The whole group is a single node rather than a `RadioGroup` container with `Radio`
 * children, for the reason `Select` is: a list of choices is data. It is also what makes
 * the group *correct* — radios that share a `name` are one control, and a user assembling
 * them from separate nodes would have to type the same name into each one and get no
 * warning when they did not.
 *
 * `name` is a real prop rather than something derived from the node id, because it is
 * the key the value arrives under when the form is submitted. Deriving it would produce
 * a working group whose field was called `n_a4f19c`, which is not a thing anyone would
 * choose to ship.
 */
export function Radio({
  options,
  value,
  name,
  orientation,
  disabled,
  className,
  children: _children,
  readOnly,
  ...rest
}: RadioProps) {
  const isDisabled = asBoolean(disabled);
  const items = parseOptions(asString(options));
  const selected = asString(value);
  const group = asString(name, 'choice');

  return (
    <div
      className={['ub-radio-group', className].filter(Boolean).join(' ')}
      role="radiogroup"
      data-orientation={asEnum(orientation, RADIO_ORIENTATIONS, 'vertical')}
      data-disabled={isDisabled ? '' : undefined}
      {...rest}
    >
      {items.map((option) => (
        <label key={option.value} className="ub-radio">
          <input
            type="radio"
            className="ub-radio-input"
            name={group}
            value={option.value}
            {...checkedBinding(option.value === selected, readOnly)}
            disabled={isDisabled}
          />
          <span className="ub-radio-label">{option.label}</span>
        </label>
      ))}
    </div>
  );
}
