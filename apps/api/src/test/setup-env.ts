import { resolveTestDatabaseUrl } from './database.js';

/**
 * Runs before any test file is imported, which is the whole point: `src/env.ts` reads
 * `process.env` at module load and `src/db/client.ts` opens its pool from that. Pointing
 * at the test database has to happen before either is pulled in.
 *
 * dotenv does not overwrite variables that are already set, so these assignments survive
 * the `.env` load inside `env.ts`.
 */
process.env['DATABASE_URL'] = resolveTestDatabaseUrl();
process.env['NODE_ENV'] = 'test';

// A passing run should print test results, not a request log per assertion.
// `LOG_LEVEL=info npx vitest ...` still gets them when a failure needs explaining.
process.env['LOG_LEVEL'] ??= 'silent';
