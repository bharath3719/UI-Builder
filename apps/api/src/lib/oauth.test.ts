/**
 * The token exchange, and the cache around it.
 *
 * The cache is the half worth testing hardest: it is the piece that decides how often a
 * client secret leaves this process, and every one of its failure modes is quiet. A cache
 * that never hits spends an authorization server's rate limit on nothing; one that hits
 * when it should not hands out a token that has already expired, or — the case that
 * matters most — a token minted with a secret that has since been rotated away.
 *
 * `sendOutbound` reaches the network through the global `fetch`, so that is what is stubbed
 * here rather than the module: the SSRF guard, the timeout and the byte cap all stay in the
 * path, which is where they belong. Private addresses are allowed outside production, so a
 * made-up host resolves nowhere and is never looked up.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accessTokenFor, forgetAccessToken, OAuthError } from './oauth.js';

const CONFIG = {
  tokenUrl: 'https://login.example.test/oauth2/v2.0/token',
  clientId: 'client-1',
  scope: 'https://analysis.windows.net/powerbi/api/.default',
};

/** A token response, as an authorization server sends one. */
function token(accessToken: string, expiresIn = 3600): Response {
  return new Response(JSON.stringify({ access_token: accessToken, expires_in: expiresIn }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let calls: { body: string }[];

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Module state. Without this a key reused across tests would carry a token between them,
  // which is the one kind of leak a cache test cannot detect by itself.
  for (const key of ['k', 'k2']) forgetAccessToken(key);
});

/** Answers each call with the next response in the list, recording what was sent. */
function stubFetch(...responses: (Response | (() => Promise<Response>))[]): void {
  let index = 0;
  vi.stubGlobal('fetch', async (_url: unknown, init: { body?: string }) => {
    calls.push({ body: init.body ?? '' });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return typeof next === 'function' ? next() : next;
  });
}

describe('accessTokenFor', () => {
  it('exchanges the client secret for a token', async () => {
    stubFetch(token('abc'));

    const minted = await accessTokenFor('k', CONFIG, 'shh');

    expect(minted.accessToken).toBe('abc');
    expect(minted.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('sends the client-credentials grant, with the secret in the form', async () => {
    stubFetch(token('abc'));
    await accessTokenFor('k', CONFIG, 'shh');

    const sent = new URLSearchParams(calls[0]!.body);
    expect(sent.get('grant_type')).toBe('client_credentials');
    expect(sent.get('client_id')).toBe('client-1');
    expect(sent.get('client_secret')).toBe('shh');
    expect(sent.get('scope')).toBe(CONFIG.scope);
  });

  /** `scope=` is read by some servers as a request for a scope named "", and refused. */
  it('omits the scope entirely when there is none', async () => {
    stubFetch(token('abc'));
    await accessTokenFor('k', { ...CONFIG, scope: '' }, 'shh');

    expect(new URLSearchParams(calls[0]!.body).has('scope')).toBe(false);
  });

  it('reuses a cached token rather than minting again', async () => {
    stubFetch(token('first'), token('second'));

    expect((await accessTokenFor('k', CONFIG, 'shh')).accessToken).toBe('first');
    expect((await accessTokenFor('k', CONFIG, 'shh')).accessToken).toBe('first');
    expect(calls).toHaveLength(1);
  });

  /** The point of the fingerprint: a rotated secret must not be answered from the cache. */
  it('mints again when the client secret has changed', async () => {
    stubFetch(token('first'), token('second'));

    await accessTokenFor('k', CONFIG, 'shh');
    expect((await accessTokenFor('k', CONFIG, 'rotated')).accessToken).toBe('second');
    expect(calls).toHaveLength(2);
  });

  it('mints again when the scope has changed', async () => {
    stubFetch(token('first'), token('second'));

    await accessTokenFor('k', CONFIG, 'shh');
    const next = await accessTokenFor('k', { ...CONFIG, scope: 'other' }, 'shh');

    expect(next.accessToken).toBe('second');
  });

  /**
   * Within the skew of expiry a cached token is refused, because the hop to the browser
   * and the request it then makes both happen after this answer is given.
   */
  it('does not hand out a token that is about to expire', async () => {
    stubFetch(token('first', 30), token('second', 3600));

    expect((await accessTokenFor('k', CONFIG, 'shh')).accessToken).toBe('first');
    expect((await accessTokenFor('k', CONFIG, 'shh')).accessToken).toBe('second');
  });

  it('mints once for callers that arrive together', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    stubFetch(async () => {
      await gate;
      return token('abc');
    });

    const both = Promise.all([
      accessTokenFor('k', CONFIG, 'shh'),
      accessTokenFor('k', CONFIG, 'shh'),
    ]);
    release?.();

    const [first, second] = await both;
    expect(first.accessToken).toBe('abc');
    expect(second.accessToken).toBe('abc');
    expect(calls).toHaveLength(1);
  });

  it('keeps one connection’s token out of another’s', async () => {
    stubFetch(token('for-k'), token('for-k2'));

    expect((await accessTokenFor('k', CONFIG, 'shh')).accessToken).toBe('for-k');
    expect((await accessTokenFor('k2', CONFIG, 'shh')).accessToken).toBe('for-k2');
  });

  it('forgets a token on request', async () => {
    stubFetch(token('first'), token('second'));

    await accessTokenFor('k', CONFIG, 'shh');
    forgetAccessToken('k');

    expect((await accessTokenFor('k', CONFIG, 'shh')).accessToken).toBe('second');
  });
});

describe('accessTokenFor, when the exchange fails', () => {
  it('reports the OAuth error code and description', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          error: 'invalid_client',
          error_description: 'AADSTS7000215: Invalid client secret provided.',
        }),
        { status: 401 },
      ),
    );

    // One call, two assertions on what it threw: a `Response` body can only be read once,
    // so calling twice would exhaust the stub rather than test it.
    const failure = await accessTokenFor('k', CONFIG, 'wrong').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OAuthError);
    expect((failure as Error).message).toContain('invalid_client');
    expect((failure as Error).message).toContain('AADSTS7000215');
  });

  /** A token URL pointing at a portal or a proxy is the common misconfiguration. */
  it('says the answer was not JSON rather than reporting a parse failure', async () => {
    stubFetch(new Response('<html>Sign in</html>', { status: 200 }));

    await expect(accessTokenFor('k', CONFIG, 'shh')).rejects.toThrow(/not JSON/);
  });

  it('refuses a 200 that carries no access_token', async () => {
    stubFetch(new Response(JSON.stringify({ token_type: 'Bearer' }), { status: 200 }));

    await expect(accessTokenFor('k', CONFIG, 'shh')).rejects.toThrow(/without an access_token/);
  });

  it('reports a transport failure as an OAuth error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('socket hang up');
    });

    await expect(accessTokenFor('k', CONFIG, 'shh')).rejects.toThrow(
      /Could not reach the token endpoint/,
    );
  });

  /** A failure must not be cached, in either direction: the next caller tries again. */
  it('leaves nothing behind that a later call would find', async () => {
    stubFetch(new Response('{"error":"invalid_client"}', { status: 401 }), token('recovered'));

    await expect(accessTokenFor('k', CONFIG, 'shh')).rejects.toThrow(OAuthError);
    expect((await accessTokenFor('k', CONFIG, 'shh')).accessToken).toBe('recovered');
  });

  it('refuses a token endpoint that is not https', async () => {
    stubFetch(token('abc'));

    await expect(
      accessTokenFor('k', { ...CONFIG, tokenUrl: 'ftp://example.test/token' }, 'shh'),
    ).rejects.toThrow(/Could not reach the token endpoint/);
    expect(calls).toHaveLength(0);
  });
});
