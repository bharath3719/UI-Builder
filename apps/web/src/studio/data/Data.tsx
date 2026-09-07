/**
 * The data panel — state variables and queries, PLAN.md §10.
 *
 * A left-panel view rather than an inspector tab, because both are properties of the
 * *page*, not of whatever happens to be selected. The inspector answers "what is this
 * node?"; nothing here has a node to be about, and a panel that emptied itself when the
 * canvas was clicked would be unusable for the thing it is for — writing a variable, then
 * binding it somewhere.
 *
 * Every edit goes through a `schema/ops` function via `edit`, so adding a variable, a
 * rename and a URL are all undo steps like any other. The two ops that can refuse —
 * `updateStateVar` and `updateQuery`, on an invalid or taken name — are checked *before*
 * the commit rather than caught after: `edit` applies its transform inside a React
 * updater, where a throw takes the render down rather than reaching a `catch`.
 */

import {
  addQuery,
  addStateVar,
  createQuery,
  createStateVar,
  HTTP_METHODS,
  isValidVarName,
  removeQuery,
  removeStateVar,
  stateVarUsage,
  updateQuery,
  updateStateVar,
  type Json,
  type Page,
  type QueryDef,
  type StateVar,
} from '@ui-builder/schema';
import { cyclicQueries } from '@ui-builder/runtime';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { TemplateField } from '../expressions/ExpressionField.js';
import { scopeSuggestions } from '../expressions/scope.js';
import {
  coerceStateValue,
  formatStateValue,
  parseStateValue,
  type StateVarType,
} from '../expressions/stateValue.js';
import { useStudio } from '../state/context.js';
import styles from './Data.module.css';

const VAR_TYPES: readonly StateVarType[] = ['string', 'number', 'boolean', 'json'];

/**
 * A name field that refuses rather than throws.
 *
 * The op would reject an empty, malformed or taken name by failing, which here would mean
 * a render that never completes. So the check happens on commit, and a name that cannot be
 * taken reverts and says why — the value stays what it was, which is the outcome someone
 * who typed a duplicate wanted anyway.
 */
function NameField({
  value,
  taken,
  onCommit,
  disabled,
}: {
  value: string;
  /** The other names on the page, whichever collection this belongs to. */
  taken: readonly string[];
  onCommit: (name: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);

  // A change from elsewhere — an undo, a restore — while this is not being typed into.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
    setProblem(null);
  }

  const commit = () => {
    const name = draft.trim();
    if (name === value) return;

    if (!isValidVarName(name)) {
      setDraft(value);
      setProblem('A name must start with a letter and hold only letters, digits or _.');
      return;
    }
    if (taken.includes(name)) {
      setDraft(value);
      setProblem(`${name} is already in use on this page.`);
      return;
    }

    setProblem(null);
    onCommit(name);
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
        aria-label="Name"
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

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

function StateCard({ page, variable }: { page: Page; variable: StateVar }) {
  const initialId = useId();
  const { edit, writable } = useStudio();

  const patch = (changes: Partial<Omit<StateVar, 'id'>>) => {
    edit((current) => updateStateVar(current, variable.id, changes));
  };

  /**
   * Where this variable is read *by name*.
   *
   * Action steps hold its id and survive a rename; expression text does not, and nothing
   * rewrites it (§10). So the count is a warning surface: rename `count` and these are
   * the places that stop resolving.
   */
  const usage = useMemo(() => stateVarUsage(page, variable), [page, variable]);

  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <NameField
          value={variable.name}
          taken={page.state.filter((v) => v.id !== variable.id).map((v) => v.name)}
          disabled={!writable}
          onCommit={(name) => patch({ name })}
        />

        <select
          className={styles.type}
          value={variable.type}
          disabled={!writable}
          aria-label={`${variable.name} type`}
          onChange={(event) => {
            const type = event.target.value as StateVarType;
            // The value comes across rather than being cleared, so switching `count`
            // from string to number keeps the 5 that was in it.
            patch({ type, initial: coerceStateValue(type, variable.initial) });
          }}
        >
          {VAR_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={styles.remove}
          disabled={!writable}
          title={`Delete ${variable.name}`}
          aria-label={`Delete ${variable.name}`}
          onClick={() => edit((current) => removeStateVar(current, variable.id))}
        >
          <Trash2 size={12} aria-hidden />
        </button>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.field}>
          {/* The label names the control and nothing else — a `<label>` wrapping the
              field *and* the usage line would read the whole paragraph out as the
              field's name. */}
          <label className={styles.fieldLabel} htmlFor={initialId}>
            Initial
          </label>

          {variable.type === 'boolean' ? (
            <input
              id={initialId}
              type="checkbox"
              className={styles.checkbox}
              checked={variable.initial === true}
              disabled={!writable}
              onChange={(event) => patch({ initial: event.target.checked })}
            />
          ) : (
            <textarea
              id={initialId}
              className={variable.type === 'json' ? styles.code : styles.value}
              rows={variable.type === 'json' ? 3 : 1}
              value={formatStateValue(variable.initial)}
              disabled={!writable}
              spellCheck={false}
              onChange={(event) => {
                const initial: Json = parseStateValue(variable.type, event.target.value);
                // Coalesced: typing an initial value is one decision, not one per key.
                edit((current) => updateStateVar(current, variable.id, { initial }), {
                  coalesce: `state:${variable.id}:initial`,
                });
              }}
            />
          )}
        </div>

        <p className={styles.usage}>
          {usage.length === 0
            ? 'Not read by any expression yet.'
            : `Read by ${usage.length} expression${usage.length === 1 ? '' : 's'} — renaming will not update them.`}
        </p>
      </div>
    </li>
  );
}

function StateList({ page }: { page: Page }) {
  const { edit, writable } = useStudio();

  return (
    <section className={styles.group}>
      <header className={styles.groupHead}>
        <h3 className={styles.groupTitle}>State</h3>
        <button
          type="button"
          className={styles.add}
          disabled={!writable}
          onClick={() =>
            edit((current) => addStateVar(current, createStateVar(current, { name: 'value' })))
          }
        >
          <Plus size={12} aria-hidden />
          Variable
        </button>
      </header>

      {page.state.length === 0 ? (
        <p className={styles.empty}>
          No variables yet. A variable is a value the page holds — a counter, a search box, whether
          a panel is open — and any field can read one with <code>{'{{ state.name }}'}</code>.
        </p>
      ) : (
        <ul className={styles.cards}>
          {page.state.map((variable) => (
            <StateCard key={variable.id} page={page} variable={variable} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

/** Headers, edited as the pairs they are. */
function HeadersEditor({ query }: { query: QueryDef }) {
  const { page, edit, writable } = useStudio();
  const entries = Object.entries(query.headers ?? {});

  const write = (next: [string, string][]) => {
    const headers = Object.fromEntries(next.filter(([name]) => name !== ''));
    edit((current) =>
      updateQuery(current, query.id, {
        headers: Object.keys(headers).length === 0 ? undefined : headers,
      }),
    );
  };

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>Headers</span>

      {entries.map(([name, value], index) => (
        <div key={index} className={styles.header}>
          <input
            type="text"
            className={styles.headerName}
            value={name}
            disabled={!writable}
            placeholder="Authorization"
            spellCheck={false}
            aria-label="Header name"
            onChange={(event) => {
              const next = entries.map<[string, string]>((entry, at) =>
                at === index ? [event.target.value, entry[1]] : entry,
              );
              write(next);
            }}
          />
          <TemplateField
            value={value}
            suggestions={scopeSuggestions(page)}
            disabled={!writable}
            placeholder="Bearer {{ state.token }}"
            onCommit={(text) => {
              write(
                entries.map<[string, string]>((entry, at) =>
                  at === index ? [entry[0], text] : entry,
                ),
              );
            }}
          />
          <button
            type="button"
            className={styles.remove}
            disabled={!writable}
            title="Remove this header"
            aria-label={`Remove header ${name}`}
            onClick={() => write(entries.filter((_, at) => at !== index) as [string, string][])}
          >
            <Trash2 size={12} aria-hidden />
          </button>
        </div>
      ))}

      <button
        type="button"
        className={styles.add}
        disabled={!writable}
        onClick={() => write([...(entries as [string, string][]), ['', '']])}
      >
        <Plus size={12} aria-hidden />
        Header
      </button>
    </div>
  );
}

function QueryCard({ page, query, cyclic }: { page: Page; query: QueryDef; cyclic: boolean }) {
  const urlId = useId();
  const bodyId = useId();
  const runId = useId();
  const { edit, writable } = useStudio();

  const suggestions = scopeSuggestions(page);
  const patch = (changes: Partial<Omit<QueryDef, 'id'>>) => {
    edit((current) => updateQuery(current, query.id, changes));
  };

  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <NameField
          value={query.name}
          taken={page.queries.filter((q) => q.id !== query.id).map((q) => q.name)}
          disabled={!writable}
          onCommit={(name) => patch({ name })}
        />

        <select
          className={styles.type}
          value={query.method}
          disabled={!writable}
          aria-label={`${query.name} method`}
          onChange={(event) => patch({ method: event.target.value as QueryDef['method'] })}
        >
          {HTTP_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={styles.remove}
          disabled={!writable}
          title={`Delete ${query.name}`}
          aria-label={`Delete ${query.name}`}
          onClick={() => edit((current) => removeQuery(current, query.id))}
        >
          <Trash2 size={12} aria-hidden />
        </button>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={urlId}>
            URL
          </label>
          <TemplateField
            id={urlId}
            value={query.url}
            suggestions={suggestions}
            disabled={!writable}
            placeholder="/api/users?q={{ state.search }}"
            onCommit={(url) => patch({ url })}
          />
        </div>

        {query.method === 'GET' ? null : (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={bodyId}>
              Body
            </label>
            <TemplateField
              id={bodyId}
              value={query.body ?? ''}
              suggestions={suggestions}
              disabled={!writable}
              multiline
              placeholder={'{ "name": "{{ state.name }}" }'}
              onCommit={(body) => patch({ body: body === '' ? undefined : body })}
            />
          </div>
        )}

        <HeadersEditor query={query} />

        <label className={styles.toggle} htmlFor={runId}>
          <input
            id={runId}
            type="checkbox"
            className={styles.checkbox}
            checked={query.runOnLoad}
            disabled={!writable || cyclic}
            onChange={(event) => patch({ runOnLoad: event.target.checked })}
          />
          <span>Run when the page loads, and whenever the request changes</span>
        </label>

        {cyclic ? (
          <p className={styles.warning}>
            <AlertTriangle size={12} aria-hidden />
            This query reads its own result, so running it would run it again. Trigger it from an
            action instead.
          </p>
        ) : null}
      </div>
    </li>
  );
}

function QueryList({ page }: { page: Page }) {
  const { edit, writable } = useStudio();

  // The same check the runtime makes before auto-running one, so the panel and the
  // canvas cannot disagree about which query is refusing to run.
  const cyclic = useMemo(() => cyclicQueries(page.queries), [page.queries]);

  return (
    <section className={styles.group}>
      <header className={styles.groupHead}>
        <h3 className={styles.groupTitle}>Queries</h3>
        <button
          type="button"
          className={styles.add}
          disabled={!writable}
          onClick={() =>
            edit((current) =>
              addQuery(current, createQuery(current, { name: 'query', runOnLoad: true })),
            )
          }
        >
          <Plus size={12} aria-hidden />
          Query
        </button>
      </header>

      {page.queries.length === 0 ? (
        <p className={styles.empty}>
          No queries yet. A query is an HTTP request the page can read with{' '}
          <code>{'{{ queries.name.data }}'}</code>, and its URL, body and headers can each
          interpolate state.
        </p>
      ) : (
        <ul className={styles.cards}>
          {page.queries.map((query) => (
            <QueryCard key={query.id} page={page} query={query} cyclic={cyclic.has(query.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Data() {
  const { page, symbol } = useStudio();

  // A component has no state and no queries, by design (§12): what flows into one is its
  // props, and a component that read the page it happened to be dropped on would work on
  // that page only. Saying so beats showing two empty lists whose Add buttons write to a
  // page view that is discarded on the way back out (`editDoc`).
  if (symbol) {
    return (
      <div className={styles.data}>
        <p className={styles.empty}>
          {symbol.name} is a component, so it has no page state or queries of its own. What flows
          into it is its props — those are in the Components panel. Bind them where it is placed, on
          a page that does have data.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.data}>
      <StateList page={page} />
      <QueryList page={page} />
    </div>
  );
}
