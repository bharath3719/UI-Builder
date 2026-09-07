import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ui-builder/components',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
