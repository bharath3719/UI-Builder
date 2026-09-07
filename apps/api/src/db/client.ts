import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, isProduction } from '../env.js';

/**
 * Prisma 7 talks to Postgres through a driver adapter rather than a native engine
 * binary, so the connection string is handed to `pg` here rather than read from
 * schema.prisma.
 *
 * One instance per process — each client owns a connection pool.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: isProduction ? ['warn', 'error'] : ['warn', 'error'],
});

export type Db = typeof prisma;
