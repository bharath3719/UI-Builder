/**
 * A ceiling on how often one caller may ask.
 *
 * The routes this exists for are the unauthenticated ones. `POST /api/auth/login` runs
 * argon2 on every attempt, which is the point of argon2 and also the problem: the work is
 * paid by *this* process, before anybody has proved who they are. So an unlimited login
 * route is two vulnerabilities wearing one URL — a password guessing oracle, and a way to
 * spend the API's whole event loop for the price of an HTTP request. The second is the
 * one that decides the limits below: the free-tier ARM instance this deploys to has a
 * couple of cores, and argon2 is deliberately expensive on both.
 *
 * ## Why the numbers are what they are
 *
 * `LOGIN` is per-minute and small, because nobody types their own password ten times a
 * minute and anybody trying two hundred is not the account's owner. `GLOBAL` is large
 * enough that the studio never meets it — autosave, a canvas loading assets and a panel
 * refreshing a connection list are all bursty — and small enough to be a backstop rather
 * than a decoration.
 *
 * ## What this is keyed on
 *
 * `request.ip`, which is only the caller's address because `buildApp` sets `trustProxy`.
 * Without it every request through Caddy carries the docker bridge address, the whole
 * internet shares one bucket, and the first attacker locks out every real user. The two
 * changes belong together and neither is correct alone.
 *
 * ## In memory, deliberately
 *
 * One API process serves the stack (see compose.yaml), so an in-process counter is the
 * whole truth. Running several would want a shared store — Redis is what this plugin
 * takes — and that is a decision to make when there is a second instance, not before.
 */

import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { isTest } from '../env.js';
import { RateLimitedError } from '../lib/errors.js';

/** Everything else, as a backstop. Generous: the studio is a chatty client. */
const GLOBAL_MAX = 600;

/**
 * A per-route ceiling, as route options to spread into a route definition.
 *
 * Returns *nothing* under test, and that is the whole reason this is a function rather
 * than two exported constants. `global: false` below takes the limiter off every route in
 * the suite, but a route-level `config.rateLimit` is not global and would still apply —
 * and the shared `api.register()` helper is how every API test makes a user, so a ten-per
 * minute cap on `/register` would fail the suite from the eleventh test onwards, in file
 * order, for reasons having nothing to do with what those tests assert.
 *
 * So the knowledge that limits are off under test lives here, once, rather than in each
 * route that asks for one.
 */
function limit(max: number, timeWindow: string) {
  return isTest ? {} : { config: { rateLimit: { max, timeWindow } } };
}

/**
 * Credential attempts: login and register, the two routes that hash a password.
 *
 * Per minute and small, because nobody types their own password ten times a minute and
 * anybody trying two hundred is not the account's owner.
 */
export const LOGIN_RATE_LIMIT = limit(10, '1 minute');

/**
 * Renewing a session. Looser than a login because it is a *legitimate* automatic call —
 * the studio refreshes on a timer and on regaining focus — but still bounded: the cookie
 * it needs is httpOnly, so a caller hammering this route does not hold one.
 */
export const REFRESH_RATE_LIMIT = limit(60, '1 minute');

export default fp(
  async (app) => {
    await app.register(rateLimit, {
      max: GLOBAL_MAX,
      timeWindow: '1 minute',

      /*
       * Off under test. The API's own suite drives `app.inject()` in tight loops — several
       * hundred requests from no address at all — and a limiter would make those fail as a
       * function of how fast the machine is, which is the least useful kind of flake.
       */
      global: !isTest,

      /*
       * Infrastructure probes are not traffic. Caddy proxies `/health` and the compose
       * healthcheck hits it every 30 seconds; a limiter that answered one of those with a
       * 429 would have the orchestrator restart a server that is working.
       */
      allowList: (request: FastifyRequest) => request.url === '/health',

      /*
       * Through the normal error envelope, so a 429 reads like every other refusal this
       * API makes rather than like a different service answering.
       *
       * An *error*, not the response body. The plugin does `throw errorResponseBuilder(…)`,
       * so what comes back from here lands in `setErrorHandler` like anything else a route
       * throws — and a plain `{ error: … }` object is not something `toAppError` can
       * recognise, so it became `internal_error` with a 500. The limiter worked; it just
       * told every throttled caller the server had fallen over. Returning an `AppError`
       * puts it back on the one path that produces the envelope, status and log line every
       * other refusal gets.
       */
      errorResponseBuilder: (_request, context) =>
        new RateLimitedError(
          `Too many attempts. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
          context.statusCode,
        ),
    });
  },
  { name: 'rate-limit' },
);
