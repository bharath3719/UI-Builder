/**
 * The inspector's control vocabulary — PLAN.md §8, §9.
 *
 * Presentational only: every control takes a value and reports a change, and knows
 * nothing about the document, the cascade or which cell is being edited. That split is
 * what lets the Design tab and the auto-generated Props tab share one look without
 * sharing a code path — the Props tab has no cascade to show, and a control that
 * reached for one could not be used there.
 *
 * §8's metrics are the whole design: a 28px row, a 12px muted label in the left
 * column, a near-black value in the right, hairline borders, 3px radii, no colour
 * except the one accent on focus.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { splitPalette } from '@ui-builder/components';
import styles from './controls.module.css';

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

export interface RowProps {
  label: string;
  /** Marks the value as written in the cell being edited, and offers the reset. */
  overridden?: boolean;
  onReset?: () => void;
  /** The control fills the whole row instead of sitting in the right column. */
  wide?: boolean;
  children: React.ReactNode;
  /** Associates the label with the control it names. */
  htmlFor?: string;
  /**
   * Switches the row between its own control and an expression field (PLAN.md §10).
   *
   * Offered per row rather than per panel because binding is a property of the value:
   * a `variant` can be a literal while the `label` beside it reads from state.
   */
  bind?: { bound: boolean; onToggle: () => void };
}

/**
 * One labelled control.
 *
 * The override dot is a button rather than an indicator with a separate reset: the
 * thing it marks and the thing that undoes it are the same thing, and a row this
 * dense has no room for two affordances. It occupies its slot whether or not it is
 * shown, so a value being set never shifts the control to its left.
 */
export function Row({ label, overridden, onReset, wide, children, htmlFor, bind }: RowProps) {
  return (
    <div className={[styles.row, wide ? styles.rowWide : ''].filter(Boolean).join(' ')}>
      <label className={styles.rowLabel} htmlFor={htmlFor}>
        {label}
      </label>

      <div className={styles.rowControl}>{children}</div>

      <div className={styles.rowReset}>
        {bind ? (
          <button
            type="button"
            className={[styles.bind, bind.bound ? styles.bindActive : ''].filter(Boolean).join(' ')}
            aria-pressed={bind.bound}
            onClick={bind.onToggle}
            title={
              bind.bound
                ? `Use a fixed value for ${label.toLowerCase()}`
                : `Bind ${label.toLowerCase()} to an expression`
            }
            aria-label={
              bind.bound
                ? `Use a fixed value for ${label.toLowerCase()}`
                : `Bind ${label.toLowerCase()} to an expression`
            }
          >
            {'{}'}
          </button>
        ) : null}

        {overridden && onReset ? (
          <button
            type="button"
            className={styles.reset}
            onClick={onReset}
            title={`Reset ${label.toLowerCase()}`}
            aria-label={`Reset ${label.toLowerCase()}`}
          >
            <RotateCcw size={11} strokeWidth={2.25} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Two or three controls sharing one row under a single label. */
export function Cluster({ children }: { children: React.ReactNode }) {
  return <div className={styles.cluster}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Text and numbers                                                            */
/* -------------------------------------------------------------------------- */

export interface TextControlProps {
  value: string;
  /** What the value would be if this field were left alone — the inherited one. */
  placeholder?: string;
  onCommit: (value: string) => void;
  id?: string;
  title?: string;
  /** A unit or axis marker inside the field, e.g. `W`, `px`. */
  affix?: string;
  monospace?: boolean;
}

/**
 * A text field that commits on blur and on Enter, not on every keystroke.
 *
 * Per-keystroke commits would put "1", "16", "16p", "16px" into the document in turn —
 * three of them meaningless, all four of them undo steps once Phase 8 lands. Escape
 * abandons the edit, which is the only way back once a field has been typed into.
 *
 * The local draft is re-synced from the prop whenever the field is not focused, so a
 * change from anywhere else — the canvas, a reset, switching breakpoint — is picked up
 * without clobbering an edit in progress.
 */
export function TextControl({
  value,
  placeholder,
  onCommit,
  id,
  title,
  affix,
  monospace,
}: TextControlProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  const field = (
    <input
      ref={inputRef}
      id={id}
      type="text"
      title={title}
      className={[styles.input, monospace ? styles.mono : ''].filter(Boolean).join(' ')}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(value);
          inputRef.current?.blur();
        }
      }}
    />
  );

  if (!affix) return field;

  return (
    <div className={styles.affixed}>
      <span className={styles.affix} aria-hidden="true">
        {affix}
      </span>
      {field}
    </div>
  );
}

/**
 * A length field: the same input, plus the arrow keys stepping the number in it.
 *
 * Deliberately not `<input type="number">`. A CSS length is not a number — `auto`,
 * `50%`, `2rem` and `var(--space-4)` all have to be typeable in the same field, and a
 * number input rejects every one of them. Stepping is added back by hand for the case
 * where the value *is* a bare number, which is the common one.
 */
export function LengthControl(props: TextControlProps & { step?: number }) {
  const { step = 1, onCommit, value, ...rest } = props;

  return (
    <div
      className={styles.stepper}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

        const parsed = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(value.trim());
        if (!parsed) return;

        event.preventDefault();
        const amount = (event.shiftKey ? 10 : 1) * step * (event.key === 'ArrowUp' ? 1 : -1);
        // Rounded to kill the floating-point tail a 0.1 step would otherwise leave.
        const next = Math.round((Number(parsed[1]) + amount) * 1000) / 1000;
        onCommit(`${next}${parsed[2]}`);
      }}
    >
      <TextControl {...rest} value={value} onCommit={onCommit} />
    </div>
  );
}

/**
 * The multi-line sibling, for a `text` prop — a paragraph of copy, a list of select
 * options. Same commit rules as `TextControl`, except that Enter inserts a newline:
 * in a field whose whole purpose is more than one line, Enter cannot also mean done.
 */
export function TextAreaControl({
  value,
  placeholder,
  onCommit,
  id,
  rows = 3,
}: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  id?: string;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value]);

  return (
    <textarea
      ref={ref}
      id={id}
      rows={rows}
      className={styles.textarea}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(value);
          ref.current?.blur();
        }
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Choices                                                                     */
/* -------------------------------------------------------------------------- */

export interface Choice {
  label: string;
  value: string;
  /** Shown instead of the label in a segmented control, with the label as its tooltip. */
  icon?: React.ReactNode;
}

/**
 * A native `<select>`, restyled.
 *
 * Radix's Select is the right answer once an option needs a swatch or a preview next
 * to it; for a list of CSS keywords the native control is better — it is already
 * keyboard-navigable, typeahead works, and it does not trap focus inside a panel the
 * user is tabbing through.
 */
export function SelectControl({
  value,
  choices,
  onChange,
  id,
  placeholder,
}: {
  value: string;
  choices: readonly Choice[];
  onChange: (value: string) => void;
  id?: string;
  /** Shown as a disabled first option when nothing is set. */
  placeholder?: string;
}) {
  const known = choices.some((choice) => choice.value === value);

  return (
    <div className={styles.selectWrap}>
      <select
        id={id}
        className={styles.select}
        value={known ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        {/* An empty option is always present: it is how a field goes back to unset,
            and it is what a value the theme no longer offers falls back to. */}
        <option value="">{placeholder ?? '—'}</option>
        {!known && value !== '' ? <option value={value}>{value}</option> : null}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A row of mutually exclusive buttons — flex direction, text alignment.
 *
 * For choices where the options are few and the icons are unambiguous. Clicking the
 * active option clears the value rather than doing nothing, which is the only way to
 * unset a segmented control without a separate reset for it.
 */
export function SegmentedControl({
  value,
  choices,
  onChange,
  label,
}: {
  value: string;
  choices: readonly Choice[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {choices.map((choice) => {
        const active = choice.value === value;
        return (
          <button
            key={choice.value}
            type="button"
            className={[styles.segment, active ? styles.segmentActive : '']
              .filter(Boolean)
              .join(' ')}
            aria-pressed={active}
            title={choice.label}
            onClick={() => onChange(active ? '' : choice.value)}
          >
            {choice.icon ?? choice.label}
            {choice.icon ? <span className={styles.srOnly}>{choice.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ToggleControl({
  value,
  onChange,
  id,
  label,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  id?: string;
  label: string;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      className={styles.checkbox}
      checked={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Colour                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A swatch, a text field, and the theme's palette behind the swatch.
 *
 * Token first, raw colour second (§9). A design that names `var(--primary)` re-themes
 * with the project; one that hard-codes `#0f172a` does not, so the tokens are what the
 * picker opens on and the native colour input is at the bottom of it.
 *
 * The swatch previews `var(...)` values by resolving them against a probe element
 * rather than parsing the theme itself — the value may reference a token that
 * references another, and the browser is the only thing that resolves that correctly.
 */
export function ColorControl({
  value,
  placeholder,
  tokens,
  onCommit,
  id,
}: {
  value: string;
  placeholder?: string;
  /** Theme colour tokens, as `[name, cssValue]`. */
  tokens: readonly (readonly [string, string])[];
  onCommit: (value: string) => void;
  id?: string;
}) {
  const swatchId = useId();
  const shown = value || placeholder || '';

  return (
    <div className={styles.color}>
      <Swatch value={shown} tokens={tokens} onCommit={onCommit} pickerId={swatchId} />
      <TextControl
        id={id}
        value={value}
        placeholder={placeholder}
        onCommit={onCommit}
        monospace
        title={value || placeholder}
      />
    </div>
  );
}

function tokenValue(name: string): string {
  return `var(--${name})`;
}

/**
 * A stored colour as the inspector can actually paint it.
 *
 * `var(--primary)` names a token of the **design's** theme, and the inspector is not in
 * the design — it is studio chrome, whose own stylesheet has no such property, so a
 * swatch handed that value straight paints nothing at all and reports a colour as
 * missing when it is only defined elsewhere. The tokens list beside it is that same
 * theme's, so it is what resolves it.
 *
 * Display only: what a field commits is still the `var()`, which is the whole point of
 * picking a token rather than the colour behind it.
 */
function paintable(value: string, tokens: readonly (readonly [string, string])[]): string {
  const named = /^var\(\s*--([\w-]+)\s*(?:,([\s\S]*))?\)$/.exec(value.trim());
  if (!named) return value;

  const token = tokens.find(([name]) => name === named[1]);
  if (token) return token[1];

  // `var(--brand, #eee)` — the fallback is what the browser would paint, so it is what
  // the swatch should show for a token this theme does not define.
  return named[2]?.trim() || value;
}

/**
 * A list of colours, edited as a row of wells — the control behind a `palette` prop.
 *
 * The whole of the difference from `ColorControl` is that the value is a *list*, and the
 * list has a meaning the control has to show: a named list replaces the **front** of the
 * component's own and leaves the rest of it alone, so naming one colour recolours one
 * series rather than flattening the chart. A row that stopped at the named colours would
 * hide the ones the component is actually drawing with, and the author would be choosing
 * the second colour without being able to see the first.
 *
 * So the row is always the full cycle. Named slots are solid and open a picker; the rest
 * are ghosted previews of `swatches`, which is the component's own list arriving through
 * its spec (D7) rather than this file knowing anything about charts.
 *
 * That leaves the two gestures as exact inverses, which is the whole of the interaction:
 * clicking a ghost **extends** the named list to there, and clearing a well **shortens**
 * it to before there. Neither can leave a hole, because a hole is not something the
 * comma-separated value could hold.
 */
export function PaletteControl({
  value,
  swatches,
  tokens,
  onCommit,
  id,
  label,
}: {
  value: string;
  /** The component's own colours, in order, for the slots nobody has named. */
  swatches: readonly string[];
  /** Theme colour tokens, as `[name, cssValue]`. */
  tokens: readonly (readonly [string, string])[];
  onCommit: (value: string) => void;
  id?: string;
  /** The prop's label, so each well can say which of several it is. */
  label: string;
}) {
  const pickerId = useId();
  const named = splitPalette(value);
  const cycle = Math.max(named.length, swatches.length, 1);

  /** The colour a slot is drawing with, whether or not it was named. */
  const colourAt = (index: number) =>
    named[index] ?? (swatches.length === 0 ? '' : (swatches[index % swatches.length] ?? ''));

  /** The list written out as `length` explicit colours, filling from the defaults. */
  const explicit = (length: number) => Array.from({ length }, (_, index) => colourAt(index));

  // Joined with a comma and a space, which is how the value reads back in the expression
  // field when somebody binds the prop later. `splitPalette` trims either way.
  const commit = (colours: readonly string[]) => onCommit(colours.join(', '));

  return (
    <div className={styles.paletteRow} id={id} role="group" aria-label={label}>
      {Array.from({ length: cycle }, (_, index) =>
        index < named.length ? (
          <Swatch
            key={index}
            value={colourAt(index)}
            tokens={tokens}
            pickerId={`${pickerId}-${index}`}
            label={`Colour ${index + 1}`}
            clearLabel="Theme from here"
            onCommit={(next) => {
              if (next === '') {
                commit(explicit(index));
                return;
              }
              const replaced = named.slice();
              replaced[index] = next;
              commit(replaced);
            }}
          />
        ) : (
          <button
            key={index}
            type="button"
            className={styles.well}
            title={`${colourAt(index)} — the component's own colour. Click to set it.`}
            aria-label={`Set colour ${index + 1}, currently the component's own`}
            onClick={() => commit(explicit(index + 1))}
          >
            <span
              className={styles.wellFill}
              style={{ background: paintable(colourAt(index), tokens) }}
            />
          </button>
        ),
      )}

      {/* Past the end of the cycle, for a chart drawing more series than the stylesheet
          has slots for — the component lengthens the cycle to whatever is named here. */}
      <button
        type="button"
        className={styles.wellAdd}
        title="Add a colour"
        aria-label="Add a colour"
        onClick={() => commit(explicit(named.length + 1))}
      >
        +
      </button>
    </div>
  );
}

function Swatch({
  value,
  tokens,
  onCommit,
  pickerId,
  label = 'Choose a colour',
  clearLabel = 'Clear',
}: {
  value: string;
  tokens: readonly (readonly [string, string])[];
  onCommit: (value: string) => void;
  pickerId: string;
  /** What this well is for, when it is one of several. */
  label?: string;
  /**
   * What committing nothing does here. A lone colour is cleared; a slot in a palette is
   * handed back to the component's own list, which is a different sentence for the same
   * empty string.
   */
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Closing on an outside press rather than on blur: the panel contains a native
  // colour input, and opening the OS colour dialog blurs the trigger.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.swatchWrap} ref={ref}>
      <button
        type="button"
        className={styles.swatch}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {/* The checker sits behind the fill so a transparent or unset value reads as
            transparent rather than as white. */}
        <span className={styles.swatchFill} style={{ background: paintable(value, tokens) }} />
      </button>

      {open ? (
        <div className={styles.palette} role="dialog" aria-label="Colours">
          <div className={styles.paletteLabel}>Theme</div>
          <div className={styles.tokens}>
            {tokens.map(([name, css]) => (
              <button
                key={name}
                type="button"
                className={styles.token}
                title={`${name} — ${css}`}
                onClick={() => {
                  onCommit(tokenValue(name));
                  setOpen(false);
                }}
              >
                <span className={styles.tokenFill} style={{ background: css }} />
              </button>
            ))}
          </div>

          <div className={styles.paletteLabel}>Custom</div>
          <div className={styles.custom}>
            <input
              id={pickerId}
              type="color"
              className={styles.picker}
              aria-label="Custom colour"
              // A var() or a named colour is not a hex triple, and the native input
              // silently shows black for anything it cannot parse. Black is a
              // truthful "nothing to show" here, and typing in the text field is the
              // way to enter what this cannot represent.
              value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
              onChange={(event) => onCommit(event.target.value)}
            />
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                onCommit('');
                setOpen(false);
              }}
            >
              {clearLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
