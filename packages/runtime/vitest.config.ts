import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ui-builder/runtime',
    // Node, like every other project here. The parts of this package worth asserting on
    // are the ones deliberately kept out of React — the evaluator, the interpreter, the
    // reducer and the request builder — which is why each of them is exported beside the
    // hook that uses it. `PageRenderer` and the hooks are covered by driving a real
    // browser, where an iframe is an iframe and a realm is a realm.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
