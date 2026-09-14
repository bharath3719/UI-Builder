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
  powerbiExecuteUrl,
  removeQuery,
  removeStateVar,
  stateVarUsage,
  updateQuery,
  updateStateVar,
  type ApiIntegrationSummary,
  type IntegrationQuerySource,
  type Json,
  type Page,
  type PowerBiQuerySource,
  type QueryDef,
  type StateVar,
  type UrlQuerySource,
} from '@ui-builder/schema';
import { cyclicQueries } from '@ui-builder/runtime';
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
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

/* -------------------------------------------------------------------------- */
/* Groups                                                                      */
/* -------------------------------------------------------------------------- */

/** Which groups are folded, as a plain array of titles in one key. */
const CLOSED_KEY = 'ui-builder.data.closed';

function readClosed(): string[] {
  try {
    const raw = window.localStorage.getItem(CLOSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((title) => typeof title === 'string') : [];
  } catch {
    // A disabled or full storage must not stop the panel rendering.
    return [];
  }
}

function writeClosed(titles: string[]): void {
  try {
    window.localStorage.setItem(CLOSED_KEY, JSON.stringify(titles));
  } catch {
    /* Not worth surfacing: the panel still works, it just forgets. */
  }
}

/**
 * One foldable half of the panel.
 *
 * Both halves are open lists of cards that grow without limit, so a page with a dozen
 * queries pushes State off the top of the scroller and a page with a dozen variables does
 * the same to Queries. Folding the one you are not working in is the whole point, and the
 * count stays in the header so a closed group still says how much is behind it.
 *
 * Open-ness is a per-machine preference rather than document state — the same call the
 * inspector's sections make — so it is remembered across a reload without becoming an undo
 * step or something two people editing the same page could disagree about.
 *
 * Add lives beside the toggle rather than inside the body, because a group with nothing in
 * it is exactly when you want it; pressing it while folded opens the group, since the point
 * of adding a card is to fill it in.
 */
function Group({
  title,
  count,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  count: number;
  /** The noun on the add button — "Variable", "Query". */
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  const { writable } = useStudio();
  const [closed, setClosed] = useState(() => readClosed().includes(title));

  const fold = (next: boolean) => {
    setClosed(next);
    const titles = readClosed().filter((one) => one !== title);
    writeClosed(next ? [...titles, title] : titles);
  };

  return (
    <section className={styles.group}>
      <header className={styles.groupHead}>
        {/* The button is inside the heading rather than around it: a heading is not
            phrasing content, so a `<button>` wrapping one is markup no browser owes us an
            accessibility tree for. */}
        <h3 className={styles.groupTitle}>
          <button
            type="button"
            className={styles.groupToggle}
            aria-expanded={!closed}
            onClick={() => fold(!closed)}
          >
            <span className={styles.groupChevron} aria-hidden>
              {closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
            {title}
            {count > 0 ? <span className={styles.groupCount}>{count}</span> : null}
          </button>
        </h3>

        <button
          type="button"
          className={styles.add}
          disabled={!writable}
          onClick={() => {
            if (closed) fold(false);
            onAdd();
          }}
        >
          <Plus size={12} aria-hidden />
          {addLabel}
        </button>
      </header>

      {closed ? null : children}
    </section>
  );
}

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
  const { edit } = useStudio();

  return (
    <Group
      title="State"
      count={page.state.length}
      addLabel="Variable"
      onAdd={() =>
        edit((current) => addStateVar(current, createStateVar(current, { name: 'value' })))
      }
    >
      {page.state.length === 0 ? (
        <p className={styles.empty} data-selectable>
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
    </Group>
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
        // Selectable, against the panel's default: this is the one line that says what
        // will actually be requested, and the thing to do with it is paste it into a
        // terminal. Same for the hints below, which carry expressions to copy.
        <p className={styles.requestPreview} data-selectable>
          <span className={styles.requestMethod}>{endpoint.method}</span> {integration.baseUrl}
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
        <p className={styles.hint} data-selectable>
          Rows are at <code>{endpoint.resultPath}</code>.
        </p>
      )}
    </>
  );
}

/**
 * The request half of a query against a Power BI semantic model.
 *
 * Unlike the endpoint form above, this has a great deal to edit, and that difference is
 * the feature rather than an inconsistency: a REST endpoint is a call somebody defined
 * once for the team, and a DAX statement is the question this particular visual is asking.
 * There is no useful level in between to have defined it at.
 *
 * What the connection still supplies is the base URL and the credential — which for Power
 * BI means the client secret the server trades for a token. Everything about *which* data
 * is here.
 */
function PowerBiSource({
  page,
  query,
  source,
  integrations,
}: {
  page: Page;
  query: QueryDef;
  source: PowerBiQuerySource;
  integrations: ApiIntegrationSummary[];
}) {
  const { edit, writable } = useStudio();
  const connectionId = useId();
  const daxId = useId();

  const integration = integrations.find((one) => one.id === source.integrationId);
  const suggestions = scopeSuggestions(page);

  const patchSource = (changes: Partial<PowerBiQuerySource>) => {
    edit((current) => updateQuery(current, query.id, { source: { ...source, ...changes } }));
  };

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
          onChange={(event) => patchSource({ integrationId: event.target.value })}
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

      {/*
        Said rather than enforced. A connection with a pasted bearer token *will* work
        against Power BI for as long as that token lives, which is a legitimate way to try
        this out — so the picker above lists every connection and this explains what is
        missing rather than hiding the option that produced it.
      */}
      {integration && integration.auth.type !== 'oauth2' && (
        <p className={styles.warning}>
          <AlertTriangle size={12} aria-hidden />
          {integration.name} does not use OAuth2 client credentials, so its token will not be
          refreshed when it expires.
        </p>
      )}

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Workspace ID</span>
        <TemplateField
          value={source.groupId ?? ''}
          suggestions={suggestions}
          disabled={!writable}
          placeholder="The Power BI workspace this dataset is in"
          onCommit={(groupId) =>
            patchSource({ groupId: groupId.trim() === '' ? undefined : groupId })
          }
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Dataset ID</span>
        <TemplateField
          value={source.datasetId}
          suggestions={suggestions}
          disabled={!writable}
          placeholder="00000000-0000-0000-0000-000000000000"
          onCommit={(datasetId) => patchSource({ datasetId })}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={daxId}>
          DAX
        </label>
        <TemplateField
          id={daxId}
          value={source.dax}
          suggestions={suggestions}
          disabled={!writable}
          multiline
          placeholder={'EVALUATE\nSUMMARIZECOLUMNS(Date[Year], "Revenue", [Total Revenue])'}
          onCommit={(dax) => patchSource({ dax })}
        />
      </div>

      {integration && (
        <p className={styles.requestPreview} data-selectable>
          <span className={styles.requestMethod}>POST</span>{' '}
          {powerbiExecuteUrl(integration.baseUrl, source.datasetId || '…', source.groupId ?? '')}
        </p>
      )}

      <p className={styles.hint} data-selectable>
        The result is the rows, with each column named as DAX named it minus the table qualifier —{' '}
        <code>Sales[Region]</code> reads as <code>Region</code>. Bind a table or a chart to{' '}
        <code>{`{{ queries.${query.name}.data }}`}</code>.
      </p>

      {/*
        Worth one line, in the panel rather than only in a comment. A value interpolated
        into DAX is a value interpolated into a query language, which is the same hazard a
        URL query has and one people are readier to recognise when it is spelled out.
      */}
      <p className={styles.hint} data-selectable>
        A <code>{'{{ }}'}</code> hole is substituted into the statement as text. Quote it yourself
        where DAX wants a string.
      </p>
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
   * The arms share no fields beyond `integrationId`, so a merge would carry a `url` onto an
   * integration source — the half-valid shape the document model was restructured to make
   * unrepresentable. Losing the old request is the honest cost of changing your mind, and
   * an undo brings it back.
   *
   * The one thing carried across is the connection, when the source being left had one:
   * switching an endpoint query to a Power BI query against the same connection is a real
   * gesture, and re-picking a name that is already on screen is not a decision.
   */
  const switchKind = (kind: QueryDef['source']['kind']) => {
    if (kind === query.source.kind) return;

    const chosen =
      query.source.kind === 'url' ? undefined : query.source.integrationId || undefined;
    const integrationId = chosen ?? integrations[0]?.id ?? '';

    patch({
      source:
        kind === 'url'
          ? { kind: 'url', method: 'GET', url: '' }
          : kind === 'powerbi'
            ? { kind: 'powerbi', integrationId, datasetId: '', dax: '' }
            : {
                kind: 'integration',
                integrationId,
                endpointId:
                  integrations.find((one) => one.id === integrationId)?.endpoints[0]?.id ?? '',
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
          <option value="powerbi">Power BI</option>
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
        {query.source.kind === 'url' ? (
          <UrlSource page={page} query={query} source={query.source} />
        ) : integrations.length === 0 ? (
          <p className={styles.warning}>
            <AlertTriangle size={12} aria-hidden />
            This workspace has no API connections yet. Add one from the workspace screen, or switch
            this query to a plain URL.
          </p>
        ) : query.source.kind === 'powerbi' ? (
          <PowerBiSource
            page={page}
            query={query}
            source={query.source}
            integrations={integrations}
          />
        ) : (
          <IntegrationSource
            page={page}
            query={query}
            source={query.source}
            integrations={integrations}
          />
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
  const { edit, workspaceId } = useStudio();

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
    <Group
      title="Queries"
      count={page.queries.length}
      addLabel="Query"
      onAdd={() =>
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
      {page.queries.length === 0 ? (
        <p className={styles.empty} data-selectable>
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
    </Group>
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
