/**
 * Creates the database named in DATABASE_URL if it does not exist yet.
 *
 * Prisma migrations assume the database is already there, and `createdb` is not on
 * PATH on a default Windows Postgres install — so this connects to the `postgres`
 * maintenance database with the same credentials and issues CREATE DATABASE.
 *
 *   npm run db:create
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(packageRoot, '.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env first.');
  process.exit(1);
}

const parsed = new URL(url);
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
if (!dbName) {
  console.error(`DATABASE_URL has no database name: ${parsed.pathname}`);
  process.exit(1);
}

// Same server and credentials, but the always-present maintenance database.
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
adminUrl.search = '';

const client = new pg.Client({ connectionString: adminUrl.toString() });

try {
  await client.connect();
} catch (err) {
  console.error(`Could not connect to Postgres at ${parsed.host}: ${err.message}`);
  console.error('Check the user and password in apps/api/.env.');
  process.exit(1);
}

try {
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);

  if (rowCount > 0) {
    console.log(`Database "${dbName}" already exists.`);
  } else {
    // Identifiers cannot be parameterised; quote it instead.
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    console.log(`Created database "${dbName}".`);
  }
} catch (err) {
  console.error(`Failed to create database "${dbName}": ${err.message}`);
  process.exit(1);
} finally {
  await client.end();
}
