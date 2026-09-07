import { parseOptions } from '../derive.js';
import { asBoolean, asString } from '../spec.js';
import { selectBinding, type RenderedProps } from './props.js';

export interface SelectProps extends RenderedProps {
  /** One option per line. `value | Label` splits the two; a bare line is both. */
  options?: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Supplied by the renderer for Form components; it belongs on the control. */
  readOnly?: boolean;
}

/**
 * A native `<select>`, styled to match Input.
 *
 * Options are authored as text rather than as child nodes: a list of choices is data,
 * and editing it in a textarea is faster than dropping six Option components and
 * clicking each one — which is also what keeps this a single node, and therefore
 * insertable today, while shadcn's compound Select waits for the subtree templates
 * PLAN.md §7 defers it behind.
 *
 * `value` is controlled on the canvas so that picking a default in the inspector shows at
 * once, and `defaultValue` in the preview and the export so the choice is the user's.
 * Checkbox suppresses React's controlled-field warning with `readOnly`; a `select` has no
 * such attribute, so `selectBinding` uses an empty handler for the same job.
 */
export function Select({
  options,
  value,
  placeholder,
  disabled,
  className,
  children: _children,
  readOnly,
  ...rest
}: SelectProps) {
  const isDisabled = asBoolean(disabled);
  const items = parseOptions(asString(options));
  const hint = asString(placeholder);
  const selected = asString(value);

  return (
    <select
      className={['ub-select', className].filter(Boolean).join(' ')}
      {...selectBinding(selected, readOnly)}
      disabled={isDisabled}
      data-disabled={isDisabled ? '' : undefined}
      data-placeholder={selected === '' && hint ? '' : undefined}
      {...rest}
    >
      {/* Hidden rather than merely disabled: the prompt is what the closed select
          shows before a choice is made, not one of the choices. */}
      {hint ? (
        <option value="" disabled hidden>
          {hint}
        </option>
      ) : null}
      {items.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
