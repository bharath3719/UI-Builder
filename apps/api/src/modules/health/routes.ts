import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { SCHEMA_VERSION, type HealthCheck, type HealthResponse } from '@ui-builder/schema';

/**
 * What a failed probe tells the caller.
 *
 * Deliberately fixed text. `/health` is proxied to the internet unauthenticated (see
 * deploy/Caddyfile) because that is what an infrastructure probe needs, and a Postgres
 * connection error names the host, the port and the role it tried — "password
 * authentication failed for user ui_builder" is a sentence that should not be available
 * to anyone who can type a URL. The status code is the whole of what a probe reads; the
 * reason goes to the log, where the operator is.
 */
const PROBE_FAILED = 'The database probe failed. See the API log for the reason.';

/** Round-trips a trivial query so the check fails when Postgres is unreachable. */
async function probeDatabase(
  query: () => Promise<unknown>,
  log: FastifyBaseLogger,
): Promise<HealthCheck> {
  const startedAt = performance.now();
  try {
    await query();
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt), error: null };
  } catch (err) {
    // The only place the real reason survives, and the reason this takes a logger.
    log.error({ err }, 'Health probe failed: the database did not answer');
    return { ok: false, latencyMs: null, error: PROBE_FAILED };
  }
}

const healthRoutes: FastifyPluginAsync = async (app) => {
  // Deliberately unprefixed: infrastructure probes should not have to know the API layout.
  app.get('/health', async (request, reply) => {
    const database = await probeDatabase(() => app.db.$queryRaw`SELECT 1`, request.log);

    const body: HealthResponse = {
      status: database.ok ? 'ok' : 'degraded',
      uptime: Number(process.uptime().toFixed(3)),
      schemaVersion: SCHEMA_VERSION,
      checks: { database },
    };

    return reply.status(database.ok ? 200 : 503).send(body);
  });
};

export default healthRoutes;
