/**
 * Queries — the `queries` root of the render scope (PLAN.md §10).
 *
 * A query is a request whose parts are templates, so `{{ state.search }}` in a URL is a
 * dependency and not just text: the request is rebuilt whenever the scope changes, and a
 * `runOnLoad` query re-fetches when the request it describes actually changed. That is
 * what makes a search box work with no wiring beyond the binding, and it is why the
 * request is derived during render (pure) and only the fetch happens in an effect.
 *
 * The order inside `usePageQueries` is the answer to an apparent circularity — the scope
 * contains the query states, and building a request needs the scope. It is not circular
 * because the states come out of `useState`: results -> states -> scope -> requests.
 */

import {
  adaptQueryData,
  buildQueryRequest,
  cyclicQueries,
  type EvaluateExpression,
  type HttpMethod,
  type IntegrationCatalog,
  type Json,
  type QueryDef,
  type QueryShape,
  type QueryState,
  type RenderScope,
} from '@ui-builder/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEvaluator, type EvalRealm } from './evaluate.js';

/**
 * A request with every template resolved, ready to hand to `fetch` — or the reason there
 * is none, for a query whose connection or endpoint has gone.
 */
export interface QueryRequest {
  id: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
  /**
   * Where this query's rows are, when the endpoint it calls says so. Empty for a plain
   * URL query, which has nowhere to record it — the binding says it instead.
   */
  resultPath: string;
  /**
   * What has to happen to the response before a binding sees it — `raw` for everything a
   * person wrote, `powerbi` for the one protocol whose envelope is unwrapped. Part of the
   * request rather than looked up from the query, so this hook never has to know what a
   * Power BI query is.
   */
  shape: QueryShape;
  /**
   * Everything the fetch depends on, as one string. The auto-run effect compares this
   * against what it last sent, so it re-fetches when the *request* changed rather than
   * whenever React happened to render.
   */
  key: string;
  /** Set when the request could not be built at all; `run` reports it without fetching. */
  error?: string;
}

const CYCLE_MESSAGE = 'This query depends on its own result, so it is not run automatically.';

export function buildRequest(
  query: QueryDef,
  catalog: IntegrationCatalog,
  evaluate: EvaluateExpression,
): QueryRequest {
  const built = buildQueryRequest(query.source, catalog, evaluate);

  if (!built.ok) {
    // Keyed on the message so a query that becomes buildable again — the catalogue
    // finished loading — looks like a changed request and is retried.
    return {
      id: query.id,
      method: 'GET',
      url: '',
      headers: {},
      body: undefined,
      resultPath: '',
      shape: 'raw',
      error: built.error,
      key: `error:${built.error}`,
    };
  }

  const request = {
    id: query.id,
    ...built.request,
    resultPath: built.resultPath,
    shape: built.shape,
  };

  return { ...request, key: JSON.stringify(request) };
}

/**
 * Re-exported rather than defined here: the Data panel, this hook and the code generator
 * all have to give the same answer about which queries refuse to run on their own, and
 * codegen cannot import this package (PLAN.md §2). It now lives in `schema/expr.ts`.
 */
export { cyclicQueries };

/** What an expression sees before a query has been run. */
function initialState(query: QueryDef, cyclic: ReadonlySet<string>): QueryState {
  if (cyclic.has(query.id)) return { loading: false, data: undefined, error: CYCLE_MESSAGE };
  // A query that runs on load is loading from the first paint, so a bound `{{
  // queries.users.loading }}` shows its spinner instead of flashing an empty list first.
  return { loading: query.runOnLoad, data: undefined, error: undefined };
}

function statesByName(
  queries: readonly QueryDef[],
  results: Readonly<Record<string, QueryState>>,
  cyclic: ReadonlySet<string>,
): Record<string, QueryState> {
  const states: Record<string, QueryState> = {};
  for (const query of queries)
    states[query.name] = results[query.id] ?? initialState(query, cyclic);
  return states;
}

/**
 * Reads a response body as whatever it turns out to be.
 *
 * JSON when it parses and the raw text when it does not, rather than failing: an endpoint
 * that answers `text/plain` is a legitimate thing to bind a heading to, and a JSON parse
 * error would be reported as if the request had failed when it plainly succeeded.
 */
async function readBody(response: Response): Promise<Json | undefined> {
  const text = await response.text();
  if (text === '') return undefined;

  try {
    return JSON.parse(text) as Json;
  } catch {
    return text;
  }
}

/**
 * A short reason a response failed, in a sentence rather than a status line.
 *
 * `401 Unauthorized` is accurate and tells a person building a page nothing they can act
 * on. The common statuses have one obvious cause each from this side of the wire — a
 * missing token, a wrong path, a server that is down — so they get said outright, and
 * anything else falls back to the status with whatever the server called it.
 *
 * The body is mined for a message before any of that, because an API that bothered to
 * explain itself is always more useful than a status: "Query (1,4) The syntax for ',' is
 * incorrect" beats "400 Bad Request" by a distance.
 */
function failureMessage(response: Response, body: Json | undefined): string {
  const fromBody = messageInBody(body);
  if (fromBody) return fromBody;

  switch (response.status) {
    case 401:
      return 'The connection was refused (401). Its token may be missing or expired.';
    case 403:
      return 'The connection is not allowed to read this (403).';
    case 404:
      return 'That endpoint was not found (404). Check the URL or path.';
    case 429:
      return 'The API is rate limiting these requests (429). Try again shortly.';
    default:
      break;
  }

  if (response.status >= 500) {
    return `The API returned a server error (${response.status}).`;
  }

  const label = response.statusText.trim();
  return label ? `${response.status} ${label}` : `The request failed (${response.status}).`;
}

/**
 * The message an error body carries, if it carries one anywhere recognisable.
 *
 * There is no standard for this, so the shapes checked are simply the ones that turn up:
 * `{ message }`, `{ error: 'text' }`, `{ error: { message } }`. Nothing is inferred beyond
 * them — a wrong guess would put an arbitrary string from a response in front of someone as
 * if it were an explanation.
 */
function messageInBody(body: Json | undefined): string | undefined {
  if (typeof body === 'string') {
    const text = body.trim();
    // A returned HTML page is a proxy or a login screen, not a message worth showing.
    return text && text.length <= 200 && !text.startsWith('<') ? text : undefined;
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;

  const record = body as Record<string, Json | undefined>;
  const direct = record.message ?? record.error_description;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const error = record.error;
  if (typeof error === 'string' && error.trim()) return error.trim();

  if (typeof error === 'object' && error !== null && !Array.isArray(error)) {
    const nested = (error as Record<string, Json | undefined>).message;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }

  return undefined;
}

/**
 * Why a `fetch` rejected. The browser says "Failed to fetch" for every one of these and
 * the distinction it hides is the whole diagnosis: from a page, a cross-origin API that
 * has not been told about this origin is by far the most likely cause, and it is not
 * something staring at the URL will reveal.
 */
function transportMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'TypeError') {
    return 'The request could not be sent. The API may be unreachable, or may not allow requests from this page (CORS).';
  }
  return error instanceof Error ? error.message : String(error);
}

const NO_RESULTS: Readonly<Record<string, QueryState>> = Object.freeze({});

export interface PageQueries {
  /** The scope these queries are part of — built here because building it needs them. */
  scope: RenderScope;
  run: (id: string) => Promise<void>;
}

/** A query that went out and came back wrong. See `onFailure` on the hook. */
export interface QueryFailure {
  id: string;
  /** The name the author gave it, which is what they will recognise. */
  name: string;
  message: string;
}

export type QueryFailureHandler = (failure: QueryFailure) => void;

const NO_INTEGRATIONS: IntegrationCatalog = Object.freeze({});

export function usePageQueries(
  queries: readonly QueryDef[],
  makeScope: (states: Record<string, QueryState>) => RenderScope,
  realm?: EvalRealm | null,
  /**
   * The workspace connections this page may call, supplied by the host — never read from
   * the document, which carries no credentials. Defaults to empty, which is the correct
   * state while it is still loading: integration queries report that they cannot run yet
   * and are retried when it arrives, because the catalogue is part of the request key.
   */
  catalog: IntegrationCatalog = NO_INTEGRATIONS,
  /**
   * Told when a query that actually went out came back wrong.
   *
   * The state is already on the query (`queries.users.error`), which is what a *page* binds
   * to. This is for the host: in the studio nobody has bound anything yet, so a broken
   * endpoint is otherwise completely silent while you build against it — the list just
   * stays empty. The canvas turns this into a toast.
   *
   * Only real responses and real transport failures. A query whose request could not be
   * built at all is deliberately excluded: that is the state every integration query is in
   * for the first render or two while the credential catalogue loads, and reporting it
   * would announce a problem that resolves itself a moment later, on every page load.
   */
  onFailure?: QueryFailureHandler,
): PageQueries {
  const [results, setResults] = useState<Readonly<Record<string, QueryState>>>(NO_RESULTS);

  /**
   * Held in a ref so that a host passing an inline closure does not give `run` a new
   * identity on every render — which would re-run the auto-run effect and, through it,
   * every `runOnLoad` query.
   */
  const failureHandler = useRef(onFailure);
  useEffect(() => {
    failureHandler.current = onFailure;
  }, [onFailure]);

  const cyclic = useMemo(() => cyclicQueries(queries), [queries]);
  const states = useMemo(() => statesByName(queries, results, cyclic), [queries, results, cyclic]);
  const scope = useMemo(() => makeScope(states), [makeScope, states]);

  const evaluate = useMemo(() => createEvaluator(scope, { realm }), [scope, realm]);
  const requests = useMemo(
    () => queries.map((query) => buildRequest(query, catalog, evaluate)),
    [queries, catalog, evaluate],
  );

  /** The controller of each query's in-flight request, so a re-run supersedes it. */
  const inflight = useRef(new Map<string, AbortController>());
  /** The request key each query last sent, which is what "already run" means. */
  const sent = useRef(new Map<string, string>());

  const report = useCallback(
    (id: string, message: string) => {
      const query = queries.find((candidate) => candidate.id === id);
      failureHandler.current?.({ id, name: query?.name ?? id, message });
    },
    [queries],
  );

  const run = useCallback(
    async (id: string): Promise<void> => {
      const request = requests.find((candidate) => candidate.id === id);
      if (!request) return;

      sent.current.set(id, request.key);
      inflight.current.get(id)?.abort();

      // No request to make: the connection or endpoint this query names is gone. Reported
      // as the query's own error, which is what the node reading it already knows how to
      // show — rather than a fetch of `''` that fails with something unrelated.
      if (request.error !== undefined) {
        setResults((current) => ({
          ...current,
          [id]: { loading: false, data: undefined, error: request.error },
        }));
        return;
      }

      const controller = new AbortController();
      inflight.current.set(id, controller);

      // The previous data stays visible while the next request is in flight, so a list
      // that re-queries as you type does not blink through empty on every keystroke.
      setResults((current) => ({
        ...current,
        [id]: { loading: true, data: current[id]?.data, error: undefined },
      }));

      try {
        const sendsBody = request.method !== 'GET' && !!request.body;
        const response = await fetch(request.url, {
          method: request.method,
          headers: sendsBody
            ? { 'Content-Type': 'application/json', ...request.headers }
            : request.headers,
          body: sendsBody ? request.body : undefined,
          signal: controller.signal,
        });

        const body = await readBody(response);
        if (controller.signal.aborted) return;

        // Only a successful response is reshaped. A failure body is an error envelope, and
        // running a row adapter over one would turn "400, your DAX is wrong" into no rows.
        const data = response.ok ? adaptQueryData(request.shape, body) : body;

        const failure = response.ok ? undefined : failureMessage(response, body);

        setResults((current) => ({
          ...current,
          [id]: failure
            ? { loading: false, data: undefined, error: failure }
            : { loading: false, data, error: undefined },
        }));

        if (failure) report(id, failure);
      } catch (error) {
        // An abort is this hook superseding its own request, not a failure to report.
        if (controller.signal.aborted) return;

        const failure = transportMessage(error);
        setResults((current) => ({
          ...current,
          [id]: { loading: false, data: undefined, error: failure },
        }));
        report(id, failure);
      } finally {
        if (inflight.current.get(id) === controller) inflight.current.delete(id);
      }
    },
    [requests, report],
  );

  useEffect(() => {
    for (const query of queries) {
      if (!query.runOnLoad || cyclic.has(query.id)) continue;

      const request = requests.find((candidate) => candidate.id === query.id);
      if (!request || sent.current.get(query.id) === request.key) continue;

      void run(query.id);
    }
  }, [queries, requests, cyclic, run]);

  useEffect(() => {
    const controllers = inflight.current;
    return () => {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);

  return useMemo(() => ({ scope, run }), [scope, run]);
}
