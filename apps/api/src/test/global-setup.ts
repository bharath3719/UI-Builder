import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { resolveTestDatabaseUrl, toMaintenanceUrl } from './database.js';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function ensureDatabaseExists(databaseUrl: string): Promise<string> {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  const client = new pg.Client({ connectionString: toMaintenanceUrl(databaseUrl) });

  try {
    await client.connect();
  } catch (cause) {
    throw new Error(
      `Could not reach Postgres to prepare the test database. Is it running, and are the ` +
        `credentials in apps/api/.env correct? (${cause instanceof Error ? cause.message : cause})`,
      { cause },
    );
  }

  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }

  return name;
}

/**
 * Prepares the test database once per run: create it if missing, then bring it to the
 * current migration. `migrate deploy` rather than `migrate dev` — it only applies what
 * already exists and never prompts or writes a new migration from a drifted schema.
 */
export async function setup(): Promise<void> {
  const databaseUrl = resolveTestDatabaseUrl();
  const name = await ensureDatabaseExists(databaseUrl);

  await execFileAsync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    // prisma7.config.ts reads DATABASE_URL from the environment and dotenv does not
    // override what is already set, so this wins over apps/api/.env.
    env: { ...process.env, DATABASE_URL: databaseUrl },
    shell: process.platform === 'win32',
  });

  console.log(`  test database "${name}" ready`);
}
