/**
 * @ui-builder/codegen — a document becomes a React project here.
 *
 * Dependency direction (PLAN.md §2): schema <- components <- codegen <- web / api.
 * Nothing in this package reads a file, opens a socket or looks at a clock, so the
 * studio's in-browser code panel and the API's zip route generate the same bytes.
 */

export * from './ir.js';
export * from './values.js';
export * from './lib.js';
export * from './expand.js';
export * from './walk.js';
export * from './page.js';
export * from './symbol.js';
export * from './project.js';
export * from './zip.js';
