import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ui-builder/api',
    environment: 'node',
    include: ['src/**/*.test.ts'],

    // Points DATABASE_URL at the test database before any module reads it.
    setupFiles: ['./src/test/setup-env.ts'],
    // Creates and migrates that database once for the whole run.
    globalSetup: ['./src/test/global-setup.ts'],

    // Every file shares one database and truncates between tests, so running files
    // concurrently would have them deleting each other's rows. Give each file the
    // database to itself instead — the suite is I/O-bound and short either way.
    fileParallelism: false,

    // argon2 is deliberately slow (~50ms a hash) and the first call in a process also
    // loads the native module, so the default 5s is tight for a cold auth test.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
