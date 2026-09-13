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
  parseTemplate,
  removeQuery,
  removeStateVar,
  stateVarUsage,
  updateQuery,
  updateStateVar,
  type ApiIntegrationSummary,
  type IntegrationQuerySource,
  type Json,
  type Page,
  type QueryDef,
  type StateVar,
  type UrlQuerySource,
} from '@ui-builder/schema';
import { cyclicQueries } from '@ui-builder/runtime';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useIntegrations } from '../../api/queries.js';
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

/** Headers, edited as the pairs they are. Only a URL query has its own. */
function HeadersEditor({ query, source }: { query: QueryDef; source: UrlQuerySource }) {
  const { page, edit, writable } = useStudio();
  const entries = Object.entries(source.headers ?? {});

  const write = (next: [string, string][]) => {
    const headers = Object.fromEntries(next.filter(([name]) => name !== ''));
    edit((current) =>
      updateQuery(current, query.id, {
        source: {
          ...source,
          ...(Object.keys(headers).length === 0 ? { headers: undefined } : { headers }),
        },
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

/**
 * The request half of a query, when it calls a saved workspace endpoint.
 *
 * There is very little to edit here, and that is the point of the whole feature: the
 * method, the path, the headers and the body were written once in workspace settings, so a
 * page chooses a call and fills in its holes. The endpoint's shape is shown read-only
 * rather than hidden, because "what will this actually request" is the question someone
 * binding a table is really asking.
 */
function IntegrationSource({
  page,
  query,
  source,
  integrations,
}: {
  page: Page;
  query: QueryDef;
  source: IntegrationQuerySource;
  integrations: ApiIntegrationSummary[];
}) {
  const { edit, writable } = useStudio();
  const connectionId = useId();
  const endpointId = useId();

  const integration = integrations.find((one) => one.id === source.integrationId);
  const endpoint = integration?.endpoints.find((one) => one.id === source.endpointId);

  const patchSource = (changes: Partial<IntegrationQuerySource>) => {
    edit((current) => updateQuery(current, query.id, { source: { ...source, ...changes } }));
  };

  /**
   * The holes the chosen endpoint declares, across its path, body and header values.
   *
   * Read from the endpoint rather than from what this query already stores, so that adding
   * a hole to the endpoint in workspace settings surfaces a new field here — instead of
   * silently resolving to empty at run time on every page that calls it.
   */
  const holes = endpoint
    ? [
        ...new Set(
          [endpoint.path, endpoint.body ?? '', ...Object.values(endpoint.headers)].flatMap(
            (template) =>
              parseTemplate(template)
                .filter((segment) => segment.kind === 'expr')
                .map((segment) => segment.code.trim())
                .filter((name) => name !== ''),
          ),
        ),
      ]
    : [];

  return (
    <>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={connectionId}>
          Connection
        </label>
        <select
          id={connectionId}
          className={styles.select}
          value={source.integrationId}
          disabled={!writable}
          onChange={(event) => {
            const next = integrations.find((one) => one.id === event.target.value);
            // Changing connection invalidates the endpoint and every variable with it:
            // those named holes belonging to the old endpoint. Keeping them would leave a
            // query pointing at an endpoint on a different connection.
            patchSource({
              integrationId: event.target.value,
              endpointId: next?.endpoints[0]?.id ?? '',
              variables: {},
            });
          }}
        >
          {integration === undefined && (
            <option value={source.integrationId}>This connection is no longer available</option>
          )}
          {integrations.map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={endpointId}>
          Endpoint
        </label>
        <select
          id={endpointId}
          className={styles.select}
          value={source.endpointId}
          disabled={!writable || integration === undefined}
          onChange={(event) => patchSource({ endpointId: event.target.value, variables: {} })}
        >
          {endpoint === undefined && (
            <option value={source.endpointId}>
              {integration ? 'Choose an endpoint' : 'Unavailable'}
            </option>
          )}
          {integration?.endpoints.map((one) => (
            <option key={one.id} value={one.id}>
              {one.method} {one.name}
            </option>
          ))}
        </select>
      </div>

      {integration && endpoint && (
        <p className={styles.requestPreview}>
          <span className={styles.requestMethod}>{endpoint.method}</span>
          {integration.baseUrl}
          {endpoint.path}
        </p>
      )}

      {holes.map((name) => (
        <div key={name} className={styles.field}>
          <span className={styles.fieldLabel}>{name}</span>
          <TemplateField
            value={source.variables?.[name] ?? ''}
            suggestions={scopeSuggestions(page)}
            disabled={!writable}
            placeholder="{{ state.something }}"
            onCommit={(value) =>
              patchSource({ variables: { ...(source.variables ?? {}), [name]: value } })
            }
          />
        </div>
      ))}

      {endpoint && endpoint.resultPath !== '' && (
        <p className={styles.hint}>
          Rows are at <code>{endpoint.resultPath}</code>.
        </p>
      )}
    </>
  );
}

/** The request half of a query someone is writing out by hand. */
function UrlSource({
  page,
  query,
  source,
}: {
  page: Page;
  query: QueryDef;
  source: UrlQuerySource;
}) {
  const urlId = useId();
  const bodyId = useId();
  const { edit, writable } = useStudio();

  const suggestions = scopeSuggestions(page);
  const patchSource = (changes: Partial<UrlQuerySource>) => {
    edit((current) => updateQuery(current, query.id, { source: { ...source, ...changes } }));
  };

  return (
    <>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={urlId}>
          URL
        </label>
        <TemplateField
          id={urlId}
          value={source.url}
          suggestions={suggestions}
          disabled={!writable}
          placeholder="/api/users?q={{ state.search }}"
          onCommit={(url) => patchSource({ url })}
        />
      </div>

      {source.method === 'GET' ? null : (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={bodyId}>
            Body
          </label>
          <TemplateField
            id={bodyId}
            value={source.body ?? ''}
            suggestions={suggestions}
            disabled={!writable}
            multiline
            placeholder={'{ "name": "{{ state.name }}" }'}
            onCommit={(body) => patchSource({ body: body === '' ? undefined : body })}
          />
        </div>
      )}

      <HeadersEditor query={query} source={source} />
    </>
  );
}

function QueryCard({
  page,
  query,
  cyclic,
  integrations,
}: {
  page: Page;
  query: QueryDef;
  cyclic: boolean;
  integrations: ApiIntegrationSummary[];
}) {
  const runId = useId();
  const { edit, writable } = useStudio();

  const patch = (changes: Partial<Omit<QueryDef, 'id'>>) => {
    edit((current) => updateQuery(current, query.id, changes));
  };

  /**
   * Switching kind replaces the source outright rather than merging.
   *
   * The two arms share no fields, so a merge would carry a `url` onto an integration
   * source — the half-valid shape the document model was restructured to make
   * unrepresentable. Losing the old request is the honest cost of changing your mind, and
   * an undo brings it back.
   */
  const switchKind = (kind: QueryDef['source']['kind']) => {
    if (kind === query.source.kind) return;
    patch({
      source:
        kind === 'url'
          ? { kind: 'url', method: 'GET', url: '' }
          : {
              kind: 'integration',
              integrationId: integrations[0]?.id ?? '',
              endpointId: integrations[0]?.endpoints[0]?.id ?? '',
            },
    });
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
          value={query.source.kind}
          disabled={!writable}
          aria-label={`${query.name} request kind`}
          onChange={(event) => switchKind(event.target.value as QueryDef['source']['kind'])}
        >
          <option value="integration">Endpoint</option>
          <option value="url">URL</option>
        </select>

        {query.source.kind === 'url' && (
          <select
            className={styles.type}
            value={query.source.method}
            disabled={!writable}
            aria-label={`${query.name} method`}
            onChange={(event) =>
              patch({
                source: {
                  ...(query.source as UrlQuerySource),
                  method: event.target.value as UrlQuerySource['method'],
                },
              })
            }
          >
            {HTTP_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        )}

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
        {query.source.kind === 'integration' ? (
          integrations.length === 0 ? (
            <p className={styles.warning}>
              <AlertTriangle size={12} aria-hidden />
              This workspace has no API connections yet. Add one from the workspace screen, or
              switch this query to a plain URL.
            </p>
          ) : (
            <IntegrationSource
              page={page}
              query={query}
              source={query.source}
              integrations={integrations}
            />
          )
        ) : (
          <UrlSource page={page} query={query} source={query.source} />
        )}

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
  const { edit, writable, workspaceId } = useStudio();

  /**
   * The workspace's connections, so a query can name one.
   *
   * Read here rather than per card: every card offers the same list, and one fetch behind
   * a shared cache is what keeps opening this panel from firing a request per query.
   */
  const integrations = useIntegrations(workspaceId).data ?? [];

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
              addQuery(
                current,
                createQuery(current, {
                  name: 'query',
                  runOnLoad: true,
                  // A workspace with connections gets one pre-selected, because binding to
                  // a saved endpoint is the path this feature exists for; one without
                  // falls back to the URL form rather than offering an empty picker.
                  ...(integrations[0]
                    ? {
                        source: {
                          kind: 'integration' as const,
                          integrationId: integrations[0].id,
                          endpointId: integrations[0].endpoints[0]?.id ?? '',
                        },
                      }
                    : {}),
                }),
              ),
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
            <QueryCard
              key={query.id}
              page={page}
              query={query}
              cyclic={cyclic.has(query.id)}
              integrations={integrations}
            />
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
