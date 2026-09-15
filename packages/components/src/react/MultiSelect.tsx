import type { MouseEvent } from 'react';
import { parseOptions, parseSelection } from '../derive.js';
import { asBoolean, asString } from '../spec.js';
import { checkedBinding, type RenderedProps } from './props.js';

export interface MultiSelectProps extends RenderedProps {
  /** One option per line. `value | Label` splits the two; a bare line is both. */
  options?: string;
  /** The values that start ticked, comma-separated — `parseSelection`. */
  value?: string;
  placeholder?: string;
  /** The shared `name`, which is what makes the ticked boxes one field. */
  name?: string;
  /** Whether the panel starts open. Part of the document, not editor state. */
  open?: boolean;
  disabled?: boolean;
  /** Supplied by the renderer for Form components; it belongs on the controls. */
  readOnly?: boolean;
}

/**
 * A dropdown of checkboxes, authored as text, as one node.
 *
 * The panel is a native `<details>` and each choice is a real `<input type="checkbox">`, so
 * an exported page opens the list and submits the ticks with nothing wired up — the same
 * bargain `Accordion` strikes, and the reason this compound-looking control ships no
 * JavaScript. `parseOptions` and `parseSelection` are the parses `codegen` runs too, so the
 * canvas and the export are the same markup (D6).
 *
 * The ticks are controlled on the canvas and `defaultChecked` in the preview and the export,
 * which is `checkedBinding` — a selection belongs to the inspector while the page is being
 * designed and to the reader once it ships. Opening the panel is frozen the same way and for
 * the same reason `Accordion` freezes a row: the click that opens it is the click that
 * selects the node, and a panel that shut under the pointer would be a change the document
 * never recorded.
 */
export function MultiSelect({
  options,
  value,
  placeholder,
  name,
  open,
  disabled,
  className,
  children: _children,
  readOnly,
  ...rest
}: MultiSelectProps) {
  const isDisabled = asBoolean(disabled);
  const items = parseOptions(asString(options));
  const chosen = asString(value);
  const selected = parseSelection(chosen);
  const group = asString(name, 'choices');

  const freeze = readOnly
    ? (event: MouseEvent) => {
        event.preventDefault();
      }
    : undefined;

  return (
    <details
      className={['ub-multiselect', className].filter(Boolean).join(' ')}
      open={asBoolean(open)}
      data-disabled={isDisabled ? '' : undefined}
      {...rest}
    >
      <summary className="ub-multiselect-field" onClick={freeze}>
        {chosen === '' ? (
          <span className="ub-multiselect-placeholder">{asString(placeholder)}</span>
        ) : (
          // Option order rather than the order the values were typed in: the chips have to
          // read the same way as the list they were ticked in.
          <span className="ub-multiselect-chips">
            {items
              .filter((option) => selected.includes(option.value))
              .map((option) => (
                <span key={option.value} className="ub-multiselect-chip">
                  {option.label}
                </span>
              ))}
          </span>
        )}
      </summary>

      {/* `group`, not `listbox`: the rows are checkboxes, and a listbox whose options are
          inputs is a role that contradicts its own children. */}
      <div className="ub-multiselect-menu" role="group">
        {items.map((option) => (
          <label key={option.value} className="ub-multiselect-option">
            <input
              type="checkbox"
              className="ub-multiselect-check"
              name={group}
              value={option.value}
              {...checkedBinding(selected.includes(option.value), readOnly)}
              disabled={isDisabled}
            />
            <span className="ub-multiselect-label">{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
