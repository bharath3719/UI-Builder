import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

// Same .env the server reads (see src/env.ts), resolved by package rather than cwd
// so `npm run db:migrate` works from the repo root too.
loadEnv({ path: path.join(packageRoot, '.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
