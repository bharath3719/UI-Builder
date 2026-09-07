/**
 * Vite's `?raw` import — a module's own source text, as a string.
 *
 * Declared here for `packages/components`'s reason: one test uses it, and `node:fs` would
 * have been the alternative, which means telling TypeScript this package runs in Node. It
 * runs in a browser too — the studio's code panel calls `generateProject` directly.
 *
 * The one use is `values.test.ts`, checking that the helper file an export ships is the
 * compiled twin the rest of that file just ran. Production never imports this way: `lib.ts`
 * holds plain strings, because the API's bundler sees no such thing as `?raw`.
 */
declare module '*?raw' {
  const source: string;
  export default source;
}
