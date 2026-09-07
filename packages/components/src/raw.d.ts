/**
 * Vite's `?raw` import — a module's own source text, as a string.
 *
 * Declared here because this package has no `vite/client` reference and wants none: it is
 * the data half of the library (`spec.ts`) and the less it claims about its environment
 * the better. One test uses it — `runtime.test.ts`, to check that the component an export
 * ships is the component this repo renders — and `node:fs` would have been the alternative,
 * which means telling TypeScript this package runs in Node. It does not.
 */
declare module '*?raw' {
  const source: string;
  export default source;
}
