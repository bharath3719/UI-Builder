import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Reads apps/api/.env into a scratch object rather than into `process.env`.
 *
 * This runs in the main vitest process (global setup) as well as in each worker, and
 * anything it injected there would be inherited by every worker — which is how a stray
 * LOG_LEVEL from the file once beat the test setup's own choice. Computing a value and
 * mutating the environment are separate jobs; this function only does the first.
 */
function fileEnv(): Record<string, string | undefined> {
  const parsed: Record<string, string> = {};
  loadEnv({ path: path.join(packageRoot, '.env'), processEnv: parsed, quiet: true });
  return parsed;
}

/**
 * The integration suite runs against a real Postgres — mocking Prisma would test the
 * mock, not the constraints and cascades that half of this phase relies on. It gets its
 * own database so a test run can never truncate the one being developed against.
 *
 * Deliberately does not import `../env.js`: that module validates and exits on failure,
 * and it must not be loaded before the test URL is in place.
 */
export function resolveTestDatabaseUrl(): string {
  const file = fileEnv();

  // An exported variable beats the file, so CI can point the suite anywhere.
  const override = process.env['TEST_DATABASE_URL'] ?? file['TEST_DATABASE_URL'];
  if (override) {
    return override;
  }

  const base = process.env['DATABASE_URL'] ?? file['DATABASE_URL'];
  if (!base) {
    throw new Error(
      'Neither TEST_DATABASE_URL nor DATABASE_URL is set. Copy apps/api/.env.example to apps/api/.env.',
    );
  }

  const url = new URL(base);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));

  if (!name) {
    throw new Error(`DATABASE_URL has no database name: ${base}`);
  }

  // Idempotent: calling this again with an already-derived URL returns it unchanged.
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;

  return url.toString();
}

/** The maintenance database on the same server, for CREATE DATABASE. */
export function toMaintenanceUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
}
