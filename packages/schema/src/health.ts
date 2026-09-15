import { z } from 'zod';

/** One dependency the API needs in order to serve traffic. */
export const HealthCheck = z.object({
  ok: z.boolean(),
  /** Round-trip time for the probe, or null if the probe never completed. */
  latencyMs: z.number().nullable(),
  /**
   * Human-readable failure reason. Null when `ok`.
   *
   * Says *that* the probe failed, not what the dependency said — this response is public
   * (see the health route), and a driver's own error message describes the infrastructure
   * behind it. The detail is in the API log.
   */
  error: z.string().nullable(),
});
export type HealthCheck = z.infer<typeof HealthCheck>;

export const HealthResponse = z.object({
  /** `ok` only when every check passed. */
  status: z.enum(['ok', 'degraded']),
  /** Seconds since the API process started. */
  uptime: z.number(),
  schemaVersion: z.number().int(),
  checks: z.object({
    database: HealthCheck,
  }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
