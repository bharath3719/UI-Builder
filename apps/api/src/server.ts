import { buildApp } from './app.js';
import { env } from './env.js';

const app = await buildApp();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  // pino-pretty runs in a worker thread, so app.log.error() here would be lost when
  // process.exit() tears the process down before the worker flushes. Startup
  // failures are exactly the ones you cannot afford to lose, so write them
  // synchronously to stderr instead.
  const reason = err instanceof Error ? err.message : String(err);
  console.error(`API failed to listen on ${env.HOST}:${env.PORT} — ${reason}`);
  if (err instanceof Error && 'code' in err && err.code === 'EADDRINUSE') {
    console.error(
      'Another process is already using that port. Stop it, or set PORT in apps/api/.env.',
    );
  }
  await app.close().catch(() => {});
  process.exit(1);
}
