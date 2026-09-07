/**
 * The document's own reusable components — PLAN.md §12.
 *
 * The Pages panel's sibling, and the same idea: a list of the surfaces this document has,
 * and pressing one opens it on the canvas. A component is edited exactly as a page is —
 * the same canvas, the same layers tree, the same inspector — because the studio hands all
 * three a page view of whichever is open (see `resolveSurface`).
 *
 * The prop surface lives here rather than in the Data view, and for the Data view's own
 * reason: state belongs to a page and props belong to a component, so a panel that emptied
 * itself when the canvas was clicked would be unusable for what it is for — declaring a
 * prop, then binding something to it.
 */

import { useCallback, useId, useMemo, useState } from 'react';
import {
  ChevronLeft,
  Component as ComponentIcon,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { createSymbol } from '@ui-builder/components';
import {
  addSymbol,
  addSymbolProp,
  createSymbolProp,
  defaultSymbolPropValue,
  deleteSymbol,
  duplicateSymbol,
  isValidVarName,
  removeSymbolProp,
  renameSymbol,
  setSymbolDescription,
  symbolInstances,
  symbolPropUsage,
  toPropLabel,
  updateSymbolProp,
  uniqueSymbolName,
  SYMBOL_PROP_TYPES,
  type Json,
  type SymbolDef,
  type SymbolProp,
  type SymbolPropType,
} from '@ui-builder/schema';
import { Button } from '../../ui/Button.js';
import { Dialog, DialogClose } from '../../ui/Dialog.js';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu.js';
import { useStudio } from '../state/context.js';
import styles from './Components.module.css';

const rowDomId = (id: string) => `symbol-${id}`;

/** See the note in `Pages.tsx`: a portaled menu is still a React child of its row. */
function isOwnEvent(event: React.SyntheticEvent<HTMLElement>): boolean {
  return event.currentTarget.contains(event.target as Node);
}

export function Components() {
  const { doc, symbol, target, writable, editDocument, editSymbol, selectPage, page } = useStudio();

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  /**
   * A new component, opened on arrival.
   *
   * Built outside the updater so `editSymbol` can name the id that was committed — an
   * updater may run more than once, and a second run would mint a different one. Its name
   * is re-resolved *inside*, so a collision cannot slip in between this render and the
   * click.
   */
  const create = useCallback(() => {
    const blank = createSymbol(doc);

    editDocument((current) =>
      addSymbol(current, { ...blank, name: uniqueSymbolName(current, blank.name) }),
    );
    editSymbol(blank.id);
  }, [doc, editDocument, editSymbol]);

  const duplicate = useCallback(
    (symbolId: string) => {
      editDocument((current) => duplicateSymbol(current, symbolId));
    },
    [editDocument],
  );

  const remove = useCallback(
    (symbolId: string) => {
      // No matching `selectPage`: the surface is derived, so deleting the component being
      // edited falls back to a page in the same render — including when an undo brings it
      // back, which reopens it.
      editDocument((current) => deleteSymbol(current, symbolId));
      setConfirmDelete(null);
    },
    [editDocument],
  );

  const doomed = confirmDelete ? doc.symbols.find((each) => each.id === confirmDelete) : undefined;
  const doomedUses = doomed ? symbolInstances(doc, doomed.id).length : 0;

  return (
    <div className={styles.components}>
      <div className={styles.list} role="listbox" aria-label="Components">
        {doc.symbols.length === 0 ? (
          <p className={styles.empty}>
            A component is a piece of a design you build once and place anywhere. Edit it in one
            spot and every copy follows.
          </p>
        ) : (
          doc.symbols.map((each) => (
            <Row
              key={each.id}
              symbol={each}
              uses={symbolInstances(doc, each.id).length}
              active={target.kind === 'symbol' && target.id === each.id}
              writable={writable}
              onOpen={editSymbol}
              onDuplicate={duplicate}
              onDelete={(id) =>
                symbolInstances(doc, id).length > 0 ? setConfirmDelete(id) : remove(id)
              }
            />
          ))
        )}
      </div>

      {writable && (
        <button type="button" className={styles.add} onClick={create}>
          <Plus size={13} strokeWidth={2} aria-hidden />
          New component
        </button>
      )}

      {/* Open on the canvas: everything about this one component, under the list it came
          from. Closing returns to the page the author was on rather than the first one,
          which is what `selectPage(page.id)` means here — `page` is still the last real
          page while a component is open. */}
      {symbol ? (
        <SymbolEditor
          symbol={symbol}
          onClose={() => selectPage(page.id === symbol.id ? (doc.pages[0]?.id ?? '') : page.id)}
        />
      ) : null}

      {doomed ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setConfirmDelete(null);
          }}
          title={`Delete ${doomed.name}?`}
          description={`It is placed ${doomedUses === 1 ? 'once' : `${doomedUses} times`} in this project. Deleting it removes ${doomedUses === 1 ? 'that copy' : 'those copies'} too. This can be undone.`}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => remove(doomed.id)}>
                Delete
              </Button>
            </>
          }
        >
          {null}
        </Dialog>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                         */
/* -------------------------------------------------------------------------- */

function Row({
  symbol,
  uses,
  active,
  writable,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  symbol: SymbolDef;
  uses: number;
  active: boolean;
  writable: boolean;
  onOpen: (symbolId: string) => void;
  onDuplicate: (symbolId: string) => void;
  onDelete: (symbolId: string) => void;
}) {
  return (
    <div
      id={rowDomId(symbol.id)}
      className={[styles.row, active ? styles.rowActive : ''].filter(Boolean).join(' ')}
      role="option"
      aria-selected={active}
      onPointerDown={(event) => {
        if (event.button !== 0 || !isOwnEvent(event)) return;
        onOpen(symbol.id);
      }}
    >
      <ComponentIcon className={styles.icon} size={13} strokeWidth={1.75} aria-hidden />
      <span className={styles.name}>{symbol.name}</span>
      {/* How many placements follow this one. It is the fact that makes a component worth
          having, and the number someone wants before they change or delete it. */}
      <span className={styles.uses}>{uses === 0 ? 'unused' : `${uses}×`}</span>

      {writable && (
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              className={styles.menuButton}
              title={`Component options for ${symbol.name}`}
              aria-label={`Component options for ${symbol.name}`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <MoreHorizontal size={13} strokeWidth={2} aria-hidden />
            </button>
          </MenuTrigger>

          <MenuContent align="end">
            <MenuItem onSelect={() => onDuplicate(symbol.id)}>Duplicate</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={13} />} danger onSelect={() => onDelete(symbol.id)}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The open component                                                          */
/* -------------------------------------------------------------------------- */

function SymbolEditor({ symbol, onClose }: { symbol: SymbolDef; onClose: () => void }) {
  const { writable, editDocument } = useStudio();
  const descriptionId = useId();

  const addProp = () => {
    const prop = createSymbolProp(symbol);
    editDocument((current) => addSymbolProp(current, symbol.id, prop));
  };

  return (
    <section className={styles.editor} aria-label={`${symbol.name} settings`}>
      <header className={styles.editorHead}>
        <button type="button" className={styles.back} onClick={onClose}>
          <ChevronLeft size={13} strokeWidth={2} aria-hidden />
          Done
        </button>
        <span className={styles.editorTitle}>Editing {symbol.name}</span>
      </header>

      <div className={styles.field}>
        {/* A span, not a `<label>`: the field carries its own accessible name, and a
            second one would be read out twice. The same shape the Data panel's grouped
            fields use. */}
        <span className={styles.fieldLabel}>Name</span>
        <NameField
          label="Name"
          value={symbol.name}
          disabled={!writable}
          validate={(next) => (next.trim() === '' ? 'A component needs a name.' : null)}
          onCommit={(name) => editDocument((current) => renameSymbol(current, symbol.id, name))}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={descriptionId}>
          Description
        </label>
        <input
          id={descriptionId}
          type="text"
          className={styles.input}
          value={symbol.description}
          disabled={!writable}
          placeholder="Shown in the palette"
          onChange={(event) =>
            editDocument(
              (current) => setSymbolDescription(current, symbol.id, event.target.value),
              { coalesce: `symbol-description:${symbol.id}` },
            )
          }
        />
      </div>

      <div className={styles.groupHead}>
        <h3 className={styles.groupTitle}>Props</h3>
        {writable && (
          <button type="button" className={styles.addSmall} onClick={addProp}>
            <Plus size={12} strokeWidth={2} aria-hidden />
            Add
          </button>
        )}
      </div>

      {symbol.props.length === 0 ? (
        <p className={styles.empty}>
          A prop is what each placement gets to change. Read it inside this component as{' '}
          <code>{'{{ props.name }}'}</code>.
        </p>
      ) : (
        <ul className={styles.cards}>
          {symbol.props.map((prop) => (
            <PropCard key={prop.id} symbol={symbol} prop={prop} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* One prop                                                                    */
/* -------------------------------------------------------------------------- */

function PropCard({ symbol, prop }: { symbol: SymbolDef; prop: SymbolProp }) {
  const { writable, editDocument } = useStudio();
  const defaultId = useId();
  const optionsId = useId();

  const patch = (changes: Partial<Omit<SymbolProp, 'id'>>) => {
    editDocument((current) => updateSymbolProp(current, symbol.id, prop.id, changes));
  };

  /**
   * Where this prop is read *by name*, inside the component.
   *
   * An instance's stored value moves with a rename because it is keyed data; an
   * expression is text and nothing may rewrite it (§10). So this is the warning surface:
   * rename `title` and these are the places that stop resolving.
   */
  const usage = useMemo(() => symbolPropUsage(symbol, prop), [symbol, prop]);

  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <NameField
          label={`${prop.label || prop.name} name`}
          value={prop.name}
          disabled={!writable}
          validate={(next) => {
            if (!isValidVarName(next)) {
              return 'A name must start with a letter and hold only letters, digits or _.';
            }
            if (symbol.props.some((each) => each.id !== prop.id && each.name === next)) {
              return `${next} is already in use on this component.`;
            }
            return null;
          }}
          // The label follows the name while it is still the derived one, and stops the
          // moment the author writes their own — which is what makes renaming cheap
          // without overwriting a deliberate choice.
          onCommit={(name) =>
            patch({
              name,
              label: prop.label === toPropLabel(prop.name) ? toPropLabel(name) : prop.label,
            })
          }
        />

        <select
          className={styles.type}
          value={prop.type}
          disabled={!writable}
          aria-label={`${prop.name} type`}
          onChange={(event) => {
            const type = event.target.value as SymbolPropType;
            // The default is re-derived rather than carried across: a string default on a
            // boolean prop is a value no control can show, and every instance already
            // holds its own value regardless.
            patch({ type, defaultValue: defaultSymbolPropValue(type) });
          }}
        >
          {SYMBOL_PROP_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={styles.remove}
          disabled={!writable}
          title={`Delete ${prop.name}`}
          aria-label={`Delete ${prop.name}`}
          onClick={() => editDocument((current) => removeSymbolProp(current, symbol.id, prop.id))}
        >
          <Trash2 size={12} aria-hidden />
        </button>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={defaultId}>
            Default
          </label>
          <DefaultValueField
            id={defaultId}
            prop={prop}
            disabled={!writable}
            onCommit={(defaultValue) => patch({ defaultValue })}
          />
        </div>

        {prop.type === 'enum' && (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={optionsId}>
              Options
            </label>
            {/* Authored as text, for `Select`'s reason (§7): a list of choices is data, and
                editing it in one field beats a row of controls per option. */}
            <textarea
              id={optionsId}
              className={styles.textarea}
              rows={3}
              spellCheck={false}
              disabled={!writable}
              placeholder={'value | Label\nquiet | Quiet'}
              value={(prop.options ?? [])
                .map((option) => `${option.value} | ${option.label}`)
                .join('\n')}
              onChange={(event) => patch({ options: parseOptionLines(event.target.value) })}
            />
          </div>
        )}

        <p className={styles.usage}>
          {usage.length === 0
            ? 'Not read anywhere in this component yet.'
            : `Read in ${usage.length} ${usage.length === 1 ? 'place' : 'places'}. Renaming updates every placement, but not the expressions above.`}
        </p>
      </div>
    </li>
  );
}

/**
 * `value | Label` per line, the same shape `parseOptions` reads for a `Select`.
 *
 * A line with no pipe is both — the value and the label — which is what makes typing a
 * bare list of words work.
 */
function parseOptionLines(text: string): { label: string; value: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [value, label] = line.split('|').map((part) => part.trim());
      return {
        value: value ?? '',
        label: label === undefined || label === '' ? (value ?? '') : label,
      };
    });
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A name, committed on blur and Enter rather than per keystroke.
 *
 * `Data.tsx`'s field, generalised over what counts as valid: a component's name is a
 * label and a prop's has to be an identifier, and both have to reject rather than write a
 * value the model would throw on.
 */
function NameField({
  label,
  value,
  disabled,
  validate,
  onCommit,
}: {
  label: string;
  value: string;
  disabled: boolean;
  validate: (next: string) => string | null;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const [held, setHeld] = useState(value);

  // The stored value changing underneath — an undo, a conflict resolved the other way —
  // replaces the draft. Derived during render rather than in an effect, which is the
  // pattern the rest of the studio's fields use.
  if (held !== value) {
    setHeld(value);
    setDraft(value);
    setProblem(null);
  }

  const commit = () => {
    const next = draft.trim();
    if (next === value) return;

    const failure = validate(next);
    if (failure) {
      setDraft(value);
      setProblem(failure);
      return;
    }

    setProblem(null);
    onCommit(next);
  };

  return (
    <>
      <input
        type="text"
        className={styles.name}
        value={draft}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(value);
            setProblem(null);
          }
        }}
      />
      {problem ? <p className={styles.problem}>{problem}</p> : null}
    </>
  );
}

/** The control for a prop's default, chosen by its declared type. */
function DefaultValueField({
  id,
  prop,
  disabled,
  onCommit,
}: {
  id: string;
  prop: SymbolProp;
  disabled: boolean;
  onCommit: (value: Json) => void;
}) {
  if (prop.type === 'boolean') {
    return (
      <input
        id={id}
        type="checkbox"
        className={styles.checkbox}
        checked={prop.defaultValue === true}
        disabled={disabled}
        onChange={(event) => onCommit(event.target.checked)}
      />
    );
  }

  if (prop.type === 'number') {
    return (
      <input
        id={id}
        type="number"
        className={styles.input}
        value={typeof prop.defaultValue === 'number' ? prop.defaultValue : 0}
        disabled={disabled}
        onChange={(event) => onCommit(Number(event.target.value) || 0)}
      />
    );
  }

  return (
    <input
      id={id}
      type="text"
      className={styles.input}
      value={typeof prop.defaultValue === 'string' ? prop.defaultValue : ''}
      disabled={disabled}
      placeholder="Empty"
      onChange={(event) => onCommit(event.target.value)}
    />
  );
}
