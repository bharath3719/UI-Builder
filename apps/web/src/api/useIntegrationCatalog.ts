import { useEffect, useMemo, useState } from 'react';
import type { ApiIntegrationSummary, CatalogEntry, IntegrationCatalog } from '@ui-builder/schema';
import { readIntegrationSecret } from './integrations.js';
import { useIntegrations } from './queries.js';

/**
 * The connections a page's queries can actually call, credentials included.
 *
 * This is the piece that makes an integration query run on the canvas: the document names
 * an endpoint by id, and something has to turn that into a base URL, an auth scheme and a
 * token. It is assembled here — in the host — and never stored in the document, which is
 * what keeps a revision, a publish and an exported zip free of credentials.
 *
 * ## Why the tokens are not in the query cache
 *
 * The connections themselves are (`useIntegrations`), because they are ordinary data every
 * panel wants. The secrets are held in this hook's own state instead. A query cache is a
 * long-lived, inspectable store that survives navigation and prints itself into devtools;
 * a credential should live for as long as something needs to send it and no longer. This
 * is a smaller exposure than the call path already implies, not a fix for it — the browser
 * is going to hold the token either way. It is simply not worth *also* leaving it in the
 * most discoverable place in the app.
 *
 * ## A missing token is not an error
 *
 * A viewer whose role cannot read secrets gets 403s here, and those are swallowed: the
 * entry is still built, with `secret: null`, so the request goes out unauthenticated and
 * the API it calls says what it thinks of that. One failure to explain instead of two, and
 * a page that renders rather than a panel that refuses.
 */
function connectionOf(integration: ApiIntegrationSummary, secret: string | null): CatalogEntry {
  const endpoints: Record<string, CatalogEntry['endpoints'][string]> = {};
  for (const endpoint of integration.endpoints) {
    endpoints[endpoint.id] = {
      method: endpoint.method,
      path: endpoint.path,
      headers: endpoint.headers,
      body: endpoint.body,
      resultPath: endpoint.resultPath,
    };
  }

  return {
    connection: {
      baseUrl: integration.baseUrl,
      auth: integration.auth,
      defaultHeaders: integration.defaultHeaders,
      contentType: integration.contentType,
    },
    endpoints,
    secret,
  };
}

/**
 * The secrets belonging to one particular version of the connection list.
 *
 * `for` is what makes this safe, and it is the whole of the fix described below: a lookup
 * that does not name which list it was gathered for cannot be told apart from one gathered
 * for a different, older list.
 */
interface Secrets {
  for: string;
  values: Readonly<Record<string, string | null>>;
}

/**
 * Identifies a version of the list for the purpose of "have I fetched its secrets".
 *
 * Includes `hasSecret`, not just the ids, because that flag is exactly what changes when
 * someone saves a token onto a connection that had none — and a stale list that still says
 * `false` must not be mistaken for one whose secrets are already in hand.
 */
function listKey(list: readonly ApiIntegrationSummary[]): string {
  return list.map((one) => `${one.id}:${one.hasSecret ? 1 : 0}`).join(',');
}

const NO_SECRETS: Secrets = Object.freeze({ for: '', values: Object.freeze({}) });
const NO_CATALOG: IntegrationCatalog = Object.freeze({});

/**
 * How long before a token expires to go and get another one.
 *
 * The same sixty seconds the server mints with, for the same reason and at the other end
 * of the same wire: a page that starts a request 59 seconds before its token dies should
 * already be holding the next one.
 */
const RENEW_LEAD_MS = 60_000;

/** Never sooner than this, so a clock skew cannot turn renewal into a request loop. */
const MIN_RENEW_MS = 5_000;

/**
 * Nor later than this. `setTimeout` silently fires *immediately* for a delay over about
 * 24.8 days, which would be the same loop wearing a disguise; and a token claiming a
 * twelve-hour life is one worth checking on anyway.
 */
const MAX_RENEW_MS = 12 * 60 * 60 * 1000;

/**
 * When to re-fetch, given every expiry just received — or null when nothing expires.
 *
 * The soonest one, because these are fetched together and a single renewal covers the
 * whole set. Fetching six tokens to replace the one that was about to die is one request
 * instead of six timers, and the five it replaces early cost nothing: minting is cached on
 * the server, so a token that is still good comes back as the same token.
 */
function renewDelay(expiries: readonly (string | null)[], now: number): number | null {
  let soonest: number | null = null;

  for (const expiry of expiries) {
    if (expiry === null) continue;
    const at = Date.parse(expiry);
    if (!Number.isFinite(at)) continue;
    if (soonest === null || at < soonest) soonest = at;
  }

  if (soonest === null) return null;
  return Math.min(MAX_RENEW_MS, Math.max(MIN_RENEW_MS, soonest - RENEW_LEAD_MS - now));
}

export function useIntegrationCatalog(workspaceId: string | undefined): IntegrationCatalog {
  const integrations = useIntegrations(workspaceId);
  const [secrets, setSecrets] = useState<Secrets>(NO_SECRETS);

  /**
   * Bumped when a credential is about to expire, which re-runs the fetch below.
   *
   * Deliberately *not* part of `Secrets.for`. That field answers "were these gathered for
   * this list", and a renewal does not change the list — so gating on the round as well
   * would empty the catalogue for the length of a round trip and every integration query
   * on the canvas would report having no connection, once an hour, for no reason.
   */
  const [round, setRound] = useState(0);

  const list = integrations.data;
  const key = list ? listKey(list) : '';

  useEffect(() => {
    if (!workspaceId || !list) return;

    // Nothing to fetch. The catalogue below handles this by asking whether the list needs
    // credentials at all, rather than by recording an empty result here — writing state
    // from an effect body is a cascading render, and this one is pure derivation.
    const needed = list.filter((integration) => integration.hasSecret);
    if (needed.length === 0) return;

    const controller = new AbortController();
    let renewal: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      const entries = await Promise.all(
        needed.map(async (integration) => {
          try {
            return await readIntegrationSecret(workspaceId, integration.id, controller.signal);
          } catch {
            // A 403 (this role may not read tokens), a 404 (deleted between fetches), a 503
            // (an authorization server that refused these client credentials), or a dropped
            // connection. All of them mean the same thing to the page: no credential.
            // Recorded as a settled `null` rather than left absent, so the request still
            // goes out and the API it calls gets to say what it thinks of that.
            return { integrationId: integration.id, secret: null, expiresAt: null };
          }
        }),
      );

      if (controller.signal.aborted) return;

      setSecrets({
        for: key,
        values: Object.fromEntries(entries.map((entry) => [entry.integrationId, entry.secret])),
      });

      // Only the schemes that mint say when they stop working, so in a workspace of pasted
      // bearer tokens this is null and nothing is scheduled — which is the truth about
      // them, not an omission.
      const delay = renewDelay(
        entries.map((entry) => entry.expiresAt),
        Date.now(),
      );
      if (delay !== null) {
        renewal = setTimeout(() => setRound((current) => current + 1), delay);
      }
    })();

    return () => {
      controller.abort();
      clearTimeout(renewal);
    };
  }, [workspaceId, list, key, round]);

  /*
   * No catalogue at all until the secrets in hand belong to *this* version of the list.
   *
   * Gated on the list rather than per connection, so the catalogue can never be a mix of a
   * new list and the previous list's credentials. The case that matters is a token saved
   * onto a connection that had none: the list changes, its key changes with it, and every
   * query waits one render rather than going out with a credential gathered for the shape
   * the connection used to have.
   *
   * The cost is that integration queries report "no connection available" for the first
   * render or two, which is the honest state. Because the catalogue is part of the request
   * key, each query then fires exactly once, with its credential, as soon as it is there.
   *
   * Memoised on the two things it is built from, and that matters more than it looks:
   * `usePageQueries` takes the catalogue as a `useMemo` dependency, so a fresh object each
   * render re-derives every query's request — a `JSON.stringify` per query — on every
   * render of the canvas, which re-renders throughout a drag. Correctness never depended on
   * it (the auto-run effect compares the serialised key, not the object), which is exactly
   * why it was invisible.
   */
  return useMemo(() => {
    if (!list || list.length === 0) return NO_CATALOG;

    // A list where nothing has a token needs no fetch, so it is ready immediately.
    const needsSecrets = list.some((integration) => integration.hasSecret);
    if (needsSecrets && secrets.for !== key) return NO_CATALOG;

    const catalog: Record<string, CatalogEntry> = {};
    for (const integration of list) {
      catalog[integration.id] = connectionOf(integration, secrets.values[integration.id] ?? null);
    }
    return catalog;
  }, [list, key, secrets]);
}
