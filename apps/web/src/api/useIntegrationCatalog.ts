import { useEffect, useState } from 'react';
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

export function useIntegrationCatalog(workspaceId: string | undefined): IntegrationCatalog {
  const integrations = useIntegrations(workspaceId);
  const [secrets, setSecrets] = useState<Secrets>(NO_SECRETS);

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

    void (async () => {
      const entries = await Promise.all(
        needed.map(async (integration) => {
          try {
            const result = await readIntegrationSecret(
              workspaceId,
              integration.id,
              controller.signal,
            );
            return [integration.id, result.secret] as const;
          } catch {
            // A 403 (this role may not read tokens), a 404 (deleted between fetches), or a
            // dropped connection. All three mean the same thing to the page: no credential.
            // Recorded as a settled `null` rather than left absent, so the request still
            // goes out and the API it calls gets to say what it thinks of that.
            return [integration.id, null] as const;
          }
        }),
      );

      if (controller.signal.aborted) return;
      setSecrets({ for: key, values: Object.fromEntries(entries) });
    })();

    return () => controller.abort();
  }, [workspaceId, list, key]);

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
   */
  if (!list || list.length === 0) return NO_CATALOG;

  // A list where nothing has a token needs no fetch, so it is ready immediately.
  const needsSecrets = list.some((integration) => integration.hasSecret);
  if (needsSecrets && secrets.for !== key) return NO_CATALOG;

  const catalog: Record<string, CatalogEntry> = {};
  for (const integration of list) {
    catalog[integration.id] = connectionOf(integration, secrets.values[integration.id] ?? null);
  }
  return catalog;
}
