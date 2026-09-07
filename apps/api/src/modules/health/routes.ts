import type { FastifyPluginAsync } from 'fastify';
import { SCHEMA_VERSION, type HealthCheck, type HealthResponse } from '@ui-builder/schema';

/** Round-trips a trivial query so the check fails when Postgres is unreachable. */
async function probeDatabase(query: () => Promise<unknown>): Promise<HealthCheck> {
  const startedAt = performance.now();
  try {
    await query();
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt), error: null };
  } catch (err) {
    return {
      ok: false,
      latencyMs: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const healthRoutes: FastifyPluginAsync = async (app) => {
  // Deliberately unprefixed: infrastructure probes should not have to know the API layout.
  app.get('/health', async (_request, reply) => {
    const database = await probeDatabase(() => app.db.$queryRaw`SELECT 1`);

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
