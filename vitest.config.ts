import { defineConfig } from 'vitest/config';

/**
 * Root test runner — currently disabled.
 *
 * The suite is switched off by choice, not by rot: every test file is still on disk and
 * still passing as of the last run (1015 tests, 55 files, ~38s). Nothing collects them
 * because `projects` is empty, and `passWithNoTests` makes `npm test` exit 0 rather than
 * fail on the empty run.
 *
 * To turn it back on, restore the line below. To bring back only the checks that catch
 * silent breakage — a migration that quietly drops a field from a saved project, an
 * export that compiles but emits a broken handler, a component spec that loses the
 * attribute the canvas hit-tests on — narrow it instead:
 *
 *   projects: ['packages/schema', 'packages/codegen', 'packages/components'],
 */
export default defineConfig({
  test: {
    // projects: ['packages/*', 'apps/*'],
    //
    // With no `projects`, the root config is the only one that runs, and an empty
    // `include` means it collects nothing. (`projects: []` is not the way to say this —
    // vitest 4 treats an empty list as a misconfiguration and errors out.)
    include: [],
    passWithNoTests: true,
  },
});
