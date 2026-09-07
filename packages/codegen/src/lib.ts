/**
 * The runtime an exported project carries in `src/lib/` — PLAN.md §10 and §11.
 *
 * Phase 10's rule was that an export is markup, with `EmitModule` as the one narrow hatch
 * for a component whose behaviour cannot be written as a static tree. Phase 11 is where
 * that rule meets a page that has state, fetches data and runs handlers, and it is met the
 * same way rather than by widening the hatch: what is generated per page stays readable
 * code that names the author's own variables, and what is identical in every project — how
 * a value becomes text, how a request becomes a result, where a toast goes — is a file
 * shipped whole, exactly as `css.ts` and `SortableRows` already are.
 *
 * Four files, each shipped only into a project that reaches for it, so a document with no
 * bindings and no queries still exports as markup and nothing else.
 *
 * Sources are strings for `css.ts`'s reason: they have to reach the studio's code panel in
 * the browser, the API's zip route in Node and a snapshot test, and a plain string is the
 * only form all three take. `values.ts` has a compiled twin in `export/values.ts` that
 * `values.test.ts` checks against the builder's own coercions, because that file is where
 * D6 is kept for bindings; the other three are React with no counterpart in this repo and
 * are pinned by the snapshot.
 */

export interface RuntimeModule {
  /** Where the file lands in the generated project, forward-slashed from its root. */
  path: string;
  /** How a page module imports it — resolved against `src/pages/`. */
  specifier: string;
  source: string;
}

export const VALUES_MODULE: RuntimeModule = {
  path: 'src/lib/values.ts',
  specifier: '../lib/values',
  source: `/**
 * The coercions a bound value goes through on its way onto the page.
 *
 * A prop the builder resolved while generating is written into the JSX as the word it
 * resolved to. A prop bound to an expression cannot be, so the coercion the canvas applied
 * to it is written out as one of these calls instead. Each one is small on purpose: they
 * are what a value passes through, not where anything is decided.
 */

/**
 * Anything at all, as the text a page shows for it.
 *
 * Null and undefined are nothing rather than their own names: a heading bound to a field
 * that has not loaded yet should be empty, not the word undefined. Objects go through JSON
 * so a mistake is visible, since an interpolated [object Object] says nothing about what
 * was actually bound.
 */
export function text(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value) ?? '';
  } catch {
    // Circular, or something with a throwing toJSON. Both are authoring mistakes and
    // neither is worth taking the page down for.
    return '';
  }
}

/**
 * Whether a value counts as present.
 *
 * An empty array is empty, which plain truthiness disagrees with — and "show this when the
 * list has rows" is the most common condition there is, so getting that wrong would be
 * getting the common case wrong.
 */
export function truthy(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

export interface NumberShape {
  /** Counts are rounded and measurements are not. Defaults to rounding. */
  round?: boolean;
  min?: number;
}

export function num(value: unknown, fallback: number, shape: NumberShape = {}): number {
  // Null is "as if the prop were not set", not zero — which is what Number(null) makes
  // it, and what a binding reading a field that has not answered yet would then show.
  const numeric =
    value === undefined || value === null
      ? Number.NaN
      : typeof value === 'number'
        ? value
        : Number(value);
  const base = Number.isFinite(numeric) ? numeric : fallback;
  const shaped = shape.round === false ? base : Math.round(base);
  return shape.min === undefined ? shaped : Math.max(shape.min, shaped);
}

/**
 * One of a fixed set of words, or the default.
 *
 * Anything unrecognised falls back rather than being passed through, because these choose
 * a class or an attribute selector and a value nothing matches is an element with no style
 * at all.
 */
export function pick(value: unknown, allowed: readonly string[], fallback: string): string {
  const chosen = text(value);
  return allowed.includes(chosen) ? chosen : fallback;
}

/** The first letter of each of the first two words: 'Ada Lovelace' becomes 'AL'. */
export function initials(value: string): string {
  const words = value.trim().split(/\\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => [...word][0]!.toUpperCase())
    .join('');
}

/** The first character, uppercased, falling back to another value's. */
export function initial(value: string, or = ''): string {
  return ([...value.trim()][0] ?? [...or][0] ?? '?').toUpperCase();
}

/**
 * What a repeat iterates.
 *
 * An array is the answer nearly every time. A number is the other one worth having,
 * because "three of these" is a layout rather than a data source. Anything else repeats
 * nothing: a list bound to a request that has not answered yet is not an error, it is a
 * list that is still empty.
 *
 * The items are loose for the same reason the page's state is: they came out of a request
 * whose shape nothing here knows, and expressions written in the builder read them by
 * name. A project that will not compile is worse than one whose rows are not narrowed.
 */
export function list(value: unknown): any[] {
  if (Array.isArray(value)) return value as unknown[];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Array.from({ length: Math.floor(value) }, (_, index) => index);
  }
  return [];
}

/**
 * A class list, skipping the parts that are not there.
 *
 * A component in src/components takes a className from whoever placed it — that is the one
 * placement's own styling — and wears it alongside its own. Joining them by hand would put
 * a stray space in the attribute every time the caller passed nothing.
 */
export function cx(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
`,
};

export const QUERY_MODULE: RuntimeModule = {
  path: 'src/lib/query.ts',
  specifier: '../lib/query',
  source: `/**
 * One HTTP data source, as a hook.
 *
 * The request itself is built by the page, because its parts can read the page's own state
 * — that is what makes a search box work with nothing wired up beyond the binding. What is
 * left here is the part every request shares: send it when it changes, keep the last answer
 * visible while the next one is in flight, and never let a superseded response overwrite a
 * newer one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueryRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** Whether to send it as soon as the page has it, and again whenever it changes. */
  runOnLoad: boolean;
}

export interface QueryResult {
  loading: boolean;
  data: unknown;
  error: string | undefined;
  /** Sends it now. Never rejects: a failure becomes error, which the page can render. */
  run: () => Promise<void>;
}

interface Answer {
  loading: boolean;
  data: unknown;
  error: string | undefined;
}

/**
 * A response body as whatever it turns out to be.
 *
 * JSON when it parses and the raw text when it does not, rather than failing: an endpoint
 * that answers text/plain is a legitimate thing to bind a heading to, and a parse error
 * would be reported as if the request had failed when it plainly succeeded.
 */
async function readBody(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body === '') return undefined;

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export function useQuery(request: QueryRequest): QueryResult {
  // Everything the fetch depends on, as one string. It is what decides whether a render
  // described a new request or merely rebuilt the same one, and it is why the callback
  // below can close over request while depending only on this: two requests with the same
  // key are the same request.
  const key = JSON.stringify([request.method, request.url, request.headers, request.body]);

  const [answer, setAnswer] = useState<Answer>({
    // A query that runs on load is loading from the first paint, so a bound loading flag
    // shows its spinner instead of flashing an empty list first.
    loading: request.runOnLoad,
    data: undefined,
    error: undefined,
  });

  /** The in-flight request, so a re-run supersedes it rather than racing it. */
  const inflight = useRef<AbortController | null>(null);
  /** The key last sent, which is what "already run" means. */
  const sent = useRef<string | null>(null);

  const run = useCallback(async () => {
    sent.current = key;
    inflight.current?.abort();

    const controller = new AbortController();
    inflight.current = controller;

    // The previous data stays visible while the next request is in flight, so a list that
    // re-queries as you type does not blink through empty on every keystroke.
    setAnswer((current) => ({ loading: true, data: current.data, error: undefined }));

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

      setAnswer(
        response.ok
          ? { loading: false, data, error: undefined }
          : {
              loading: false,
              data: undefined,
              error: (response.status + ' ' + response.statusText).trim(),
            },
      );
    } catch (error) {
      // An abort is this hook superseding its own request, not a failure to report.
      if (controller.signal.aborted) return;
      setAnswer({
        loading: false,
        data: undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (inflight.current === controller) inflight.current = null;
    }
    // key rather than request: see the note above it. Two requests with the same key are
    // the same request, so a stale closure over one of them is not stale at all.
  }, [key]);

  useEffect(() => {
    if (!request.runOnLoad) return;
    if (sent.current === key) return;
    void run();
  }, [key, request.runOnLoad, run]);

  useEffect(() => {
    return () => {
      inflight.current?.abort();
    };
  }, []);

  return { loading: answer.loading, data: answer.data, error: answer.error, run };
}
`,
};

export const TOAST_MODULE: RuntimeModule = {
  path: 'src/lib/toast.tsx',
  specifier: '../lib/toast',
  source: `/**
 * Where a "show a toast" action lands.
 *
 * Styled inline rather than through the theme, and deliberately: a toast is not part of the
 * design. Nothing in the page describes it, and a page whose own CSS could restyle it would
 * be a page able to hide its own messages. Change it here if you want it to look different.
 */

import { useCallback, useState } from 'react';

export interface Toast {
  id: number;
  message: string;
}

const TOAST_MS = 3200;

let toastCount = 0;

export function useToasts() {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const showToast = useCallback((message: string) => {
    toastCount += 1;
    const toast: Toast = { id: toastCount, message };
    setToasts((current) => [...current, toast]);
    setTimeout(() => {
      setToasts((current) => current.filter((candidate) => candidate.id !== toast.id));
    }, TOAST_MS);
  }, []);

  return { toasts, showToast };
}

export function Toasts({ toasts }: { toasts: readonly Toast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div
      // polite, so a toast is announced after whatever the reader was doing rather than
      // interrupting it — the same courtesy the visual version extends by appearing in a
      // corner.
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        insetInlineEnd: 16,
        insetBlockEnd: 16,
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            maxWidth: 320,
            padding: '10px 14px',
            borderRadius: 6,
            background: 'hsl(224 14% 16%)',
            color: 'hsl(0 0% 100%)',
            font: '13px/1.4 system-ui, sans-serif',
            boxShadow: '0 6px 20px hsl(224 14% 16% / 0.28)',
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
`,
};

export const NAVIGATE_MODULE: RuntimeModule = {
  path: 'src/lib/navigate.ts',
  specifier: '../lib/navigate',
  source: `/**
 * Where a "go to" action goes.
 *
 * A path is a route in this project, so it is handled by the router and the page changes
 * without a reload. Anything with a scheme in front of it is somewhere else entirely and is
 * followed as a real navigation. An empty destination is nothing at all rather than a trip
 * to the current URL, which is what an unfilled field would otherwise mean.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router';

export function useGoTo(): (to: string) => void {
  const navigate = useNavigate();

  return useCallback(
    (to: string) => {
      if (to === '') return;
      if (/^[a-z][a-z0-9+.-]*:/i.test(to)) {
        window.location.assign(to);
        return;
      }
      void navigate(to);
    },
    [navigate],
  );
}
`,
};
