import fp from 'fastify-plugin';
import { prisma, type Db } from '../db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

/** Exposes the shared Prisma client as `app.db` and closes the pool on shutdown. */
export default fp(
  async (app) => {
    app.decorate('db', prisma);

    app.addHook('onClose', async () => {
      await prisma.$disconnect();
    });
  },
  { name: 'prisma' },
);
