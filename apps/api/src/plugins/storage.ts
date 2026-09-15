import fp from 'fastify-plugin';
import { createStorage, type StorageDriver } from '../lib/storage.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Null when this deployment has no object storage — see `lib/storage.ts`. */
    storage: StorageDriver | null;
  }
}

/**
 * Exposes the object store as `app.storage`, the way `prisma` exposes `app.db`.
 *
 * A decorator rather than a module-level singleton in the asset service, for the reason
 * `app.db` is one: it is the seam a test replaces. Driving the upload route against a real
 * bucket would mean this suite needed credentials and a network, and driving it against
 * nothing would mean never testing the route at all.
 *
 * The client is built once here rather than per request, because it holds a connection
 * pool and a new one per upload is a TLS handshake per image.
 */
export default fp(
  async (app) => {
    app.decorate('storage', createStorage());
  },
  { name: 'storage' },
);
