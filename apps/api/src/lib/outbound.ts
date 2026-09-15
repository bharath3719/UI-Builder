/**
 * Making a request to somewhere the user named.
 *
 * Only the integration *test run* goes through here. Live page queries are made by the
 * browser (the call path this product chose), so this is authoring-time machinery — but
 * it is the one place the API fetches a URL a user typed, which makes it the one place
 * server-side request forgery is possible. Everything below is about that.
 *
 * ## What is guarded
 *
 * The scheme is limited to http/https, redirects are not followed, the response is capped
 * in both time and bytes, and the destination address is checked against the ranges that
 * only ever mean "somewhere inside our own network" — loopback, RFC 1918, link-local, and
 * the cloud metadata address in particular, which is the classic way an SSRF becomes a
 * set of production credentials.
 *
 * ## What is not
 *
 * The address is resolved, checked, and then handed to `fetch`, which resolves it again.
 * A name whose DNS answer changes between those two moments defeats the check. Closing
 * that means dialling the vetted IP ourselves and carrying the original Host through TLS
 * — a custom agent and a meaningful amount of code. It is recorded here rather than
 * quietly left out: the exposure is one authenticated workspace editor making one
 * unfollowed request whose response they can already see, and the cap on that is smaller
 * than the cost of the fix. Revisit it if this path ever serves anything unauthenticated.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { allowsPrivateNetwork } from '../env.js';

/** 30 seconds. Long enough for a slow report endpoint, short enough to not hold a worker. */
const TIMEOUT_MS = 30_000;

/** 2 MB. A sample response is for looking at field names, not for importing a dataset. */
const MAX_BYTES = 2 * 1024 * 1024;

export interface OutboundRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | undefined;
}

export interface OutboundResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Decoded as text; the caller decides whether it parses as JSON. */
  text: string;
  durationMs: number;
}

/** A request that could not be made, or could not be completed. Never a non-2xx status. */
export class OutboundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundError';
  }
}

function ipv4IsPrivate(address: string): boolean {
  const parts = address.split('.').map(Number);
  const [a = 0, b = 0] = parts;

  return (
    a === 0 || // 0.0.0.0/8, "this network"
    a === 10 || // RFC 1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // RFC 6598 carrier-grade NAT
    (a === 169 && b === 254) || // link-local, and 169.254.169.254 — cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // RFC 1918
    (a === 192 && b === 168) || // RFC 1918
    a >= 224 // multicast and reserved
  );
}

function ipv6IsPrivate(address: string): boolean {
  const value = address.toLowerCase();

  // A v4-mapped address (::ffff:127.0.0.1) is a v4 address wearing a v6 spelling, and
  // checking it as v6 would wave the loopback straight through.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped?.[1]) return ipv4IsPrivate(mapped[1]);

  return (
    value === '::' ||
    value === '::1' ||
    value.startsWith('fe80:') || // link-local
    value.startsWith('fc') || // unique local, fc00::/7
    value.startsWith('fd') ||
    value.startsWith('ff') // multicast
  );
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return ipv4IsPrivate(address);
  if (version === 6) return ipv6IsPrivate(address);
  // Not an address at all. Treated as private so an unparseable answer fails closed.
  return true;
}

/**
 * Whether this deployment lets integrations point inside its own network.
 *
 * True in development because "run the builder against the API I am also running on this
 * laptop" is the ordinary case, and a guard that forbids it teaches people to disable the
 * guard. False in production, where the same request is how an SSRF reaches the metadata
 * service.
 *
 * Resolved in `env.ts` rather than here: it is the one setting that depends on NODE_ENV as
 * well as on itself, and the server warns about it at boot, so both readings have to come
 * from the same place.
 */
async function assertPublicDestination(url: URL): Promise<void> {
  if (allowsPrivateNetwork) return;

  const host = url.hostname.replace(/^\[|\]$/g, '');

  // A literal address never reaches DNS, so check it directly rather than looking it up.
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new OutboundError(`Requests to ${host} are not allowed: it is a private address.`);
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    // `all` because a name with both a public and a private answer must fail on the
    // private one — checking only the first answer is a check that can be arranged around.
    addresses = await lookup(host, { all: true });
  } catch {
    throw new OutboundError(`Could not resolve ${host}.`);
  }

  const blocked = addresses.find((entry) => isPrivateAddress(entry.address));
  if (blocked) {
    throw new OutboundError(
      `Requests to ${host} are not allowed: it resolves to the private address ${blocked.address}.`,
    );
  }
}

/** Reads at most `MAX_BYTES`, so a streaming endpoint cannot fill the heap. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > MAX_BYTES) {
        throw new OutboundError(
          `The response is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    // The response is abandoned on both the cap and a mid-stream failure; without this
    // the socket stays open until the peer gives up on it.
    await reader.cancel().catch(() => undefined);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function sendOutbound(request: OutboundRequest): Promise<OutboundResult> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new OutboundError(`"${request.url}" is not a valid URL.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundError(`${url.protocol} URLs are not supported — use http or https.`);
  }

  await assertPublicDestination(url);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      // Not followed on purpose: a 302 is the other half of the SSRF story, and it would
      // land somewhere `assertPublicDestination` never saw. The panel shows the redirect
      // and its Location, which is more useful than silently ending up elsewhere.
      redirect: 'manual',
      signal: controller.signal,
    });

    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      text: await readCapped(response),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof OutboundError) throw error;
    if (controller.signal.aborted) {
      throw new OutboundError(`The request did not finish within ${TIMEOUT_MS / 1000} seconds.`);
    }
    throw new OutboundError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}
