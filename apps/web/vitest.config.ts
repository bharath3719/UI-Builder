import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ui-builder/web',
    // The studio's testable parts are the ones deliberately kept out of React — drop
    // resolution, tree flattening, form-error mapping. Components are covered by
    // driving a real browser instead, where an iframe is an iframe.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
