import { defineConfig } from 'vitest/config';

/**
 * Root test runner. Each workspace is a project, so `npm test` from the repo root
 * runs everything and `vitest --project @ui-builder/schema` narrows to one package.
 */
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    passWithNoTests: true,
  },
});
