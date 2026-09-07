import { describe, expect, it } from 'vitest';
import { HealthResponse } from './health.js';
import { SCHEMA_VERSION } from './version.js';

describe('HealthResponse', () => {
  const healthy = {
    status: 'ok',
    uptime: 1.25,
    schemaVersion: SCHEMA_VERSION,
    checks: { database: { ok: true, latencyMs: 3, error: null } },
  };

  it('accepts a healthy payload', () => {
    expect(HealthResponse.parse(healthy)).toEqual(healthy);
  });

  it('accepts a degraded payload with a failed check', () => {
    const degraded = {
      ...healthy,
      status: 'degraded',
      checks: { database: { ok: false, latencyMs: null, error: 'connection refused' } },
    };
    expect(HealthResponse.parse(degraded)).toEqual(degraded);
  });

  it('rejects an unknown status', () => {
    expect(() => HealthResponse.parse({ ...healthy, status: 'fine' })).toThrow();
  });

  it('rejects a check missing its error field', () => {
    const bad = { ...healthy, checks: { database: { ok: true, latencyMs: 3 } } };
    expect(() => HealthResponse.parse(bad)).toThrow();
  });
});
