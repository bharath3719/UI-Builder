import { defineConfig } from 'tsup';

/**
 * Workspace packages ship TypeScript source rather than build output, so the API is
 * bundled for production. That keeps `npm run dev` free of any build-the-deps-first step.
 */
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  // Prisma's generated client and its engine binaries must stay external.
  external: ['@prisma/client'],
  noExternal: [/^@ui-builder\//],
});
