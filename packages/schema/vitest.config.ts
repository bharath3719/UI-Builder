import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ui-builder/schema',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
