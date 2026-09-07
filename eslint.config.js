import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'apps/api/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.es2024 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // The studio runs in a browser and uses React.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // The API runs in Node, and since the component library's specs were split from its
  // React implementations its tsconfig no longer pulls in the DOM types — so `tsc` is
  // the first thing that would reject a browser global here. This stays as the backstop:
  // `no-undef` is off for TypeScript (typescript-eslint turns it off, on the grounds that
  // the compiler does it better), so if anything ever puts the DOM lib back, the rule is
  // what catches a `document` in a request handler rather than nothing at all.
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'The API runs in Node; there is no DOM here.' },
        { name: 'window', message: 'The API runs in Node; there is no DOM here.' },
        { name: 'navigator', message: 'The API runs in Node; there is no DOM here.' },
        { name: 'localStorage', message: 'The API runs in Node; there is no DOM here.' },
        { name: 'sessionStorage', message: 'The API runs in Node; there is no DOM here.' },
      ],
    },
  },

  // Config files and scripts may log freely.
  {
    files: ['**/*.config.{ts,js,mjs}', '**/scripts/**/*.{ts,mts,js,mjs}'],
    rules: { 'no-console': 'off' },
  },
);
