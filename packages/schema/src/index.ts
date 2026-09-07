/**
 * @ui-builder/schema — the single contract every other package agrees on.
 *
 * Dependency direction (see PLAN.md §2, never violate):
 *   schema <- components <- runtime <- web
 *   schema <- codegen    <- web / api
 *   schema <- api
 *
 * This package must never import from another workspace package.
 */

export * from './version.js';
export * from './health.js';
export * from './api/index.js';

export * from './doc.js';
export * from './expr.js';
export * from './migrate.js';
export * from './ops.js';
export * from './pages.js';
export * from './symbols.js';
export * from './cascade.js';
export * from './style.js';
export * from './theme.js';
