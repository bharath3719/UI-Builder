import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ui-builder/codegen',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
