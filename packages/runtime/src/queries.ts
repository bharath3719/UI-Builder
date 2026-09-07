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
  cyclicQueries,
  evaluateTemplate,
  stringifyValue,
  type EvaluateExpression,
  type HttpMethod,
  type Json,
  type QueryDef,
  type QueryState,
  type RenderScope,
} from '@ui-builder/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEvaluator, type EvalRealm } from './evaluate.js';

/** A request with every template resolved, ready to hand to `fetch`. */
export interface QueryRequest {
  id: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
  /**
   * Everything the fetch depends on, as one string. The auto-run effect compares this
   * against what it last sent, so it re-fetches when the *request* changed rather than
   * whenever React happened to render.
   */
  key: string;
}

const CYCLE_MESSAGE = 'This query depends on its own result, so it is not run automatically.';

/** A template that has to end up as a string — a URL, a header, a body. */
function asText(source: string, evaluate: EvaluateExpression): string {
  return stringifyValue(evaluateTemplate(source, evaluate));
}

export function buildRequest(query: QueryDef, evaluate: EvaluateExpression): QueryRequest {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(query.headers ?? {})) {
    headers[name] = asText(value, evaluate);
  }

  const request = {
    id: query.id,
    method: query.method,
    url: asText(query.url, evaluate),
    headers,
    body: query.body === undefined ? undefined : asText(query.body, evaluate),
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

const NO_RESULTS: Readonly<Record<string, QueryState>> = Object.freeze({});

export interface PageQueries {
  /** The scope these queries are part of — built here because building it needs them. */
  scope: RenderScope;
  run: (id: string) => Promise<void>;
}

export function usePageQueries(
  queries: readonly QueryDef[],
  makeScope: (states: Record<string, QueryState>) => RenderScope,
  realm?: EvalRealm | null,
): PageQueries {
  const [results, setResults] = useState<Readonly<Record<string, QueryState>>>(NO_RESULTS);

  const cyclic = useMemo(() => cyclicQueries(queries), [queries]);
  const states = useMemo(() => statesByName(queries, results, cyclic), [queries, results, cyclic]);
  const scope = useMemo(() => makeScope(states), [makeScope, states]);

  const evaluate = useMemo(() => createEvaluator(scope, { realm }), [scope, realm]);
  const requests = useMemo(
    () => queries.map((query) => buildRequest(query, evaluate)),
    [queries, evaluate],
  );

  /** The controller of each query's in-flight request, so a re-run supersedes it. */
  const inflight = useRef(new Map<string, AbortController>());
  /** The request key each query last sent, which is what "already run" means. */
  const sent = useRef(new Map<string, string>());

  const run = useCallback(
    async (id: string): Promise<void> => {
      const request = requests.find((candidate) => candidate.id === id);
      if (!request) return;

      sent.current.set(id, request.key);
      inflight.current.get(id)?.abort();

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

        const data = await readBody(response);
        if (controller.signal.aborted) return;

        setResults((current) => ({
          ...current,
          [id]: response.ok
            ? { loading: false, data, error: undefined }
            : {
                loading: false,
                data: undefined,
                error: `${response.status} ${response.statusText}`.trim(),
              },
        }));
      } catch (error) {
        // An abort is this hook superseding its own request, not a failure to report.
        if (controller.signal.aborted) return;
        setResults((current) => ({
          ...current,
          [id]: {
            loading: false,
            data: undefined,
            error: error instanceof Error ? error.message : String(error),
          },
        }));
      } finally {
        if (inflight.current.get(id) === controller) inflight.current.delete(id);
      }
    },
    [requests],
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
