/**
 * REST contracts shared by the API and the studio.
 *
 * The API validates requests with these and types its responses from them; the studio
 * validates responses with the same objects. When a route and its caller disagree, it
 * is a type error here rather than a runtime surprise there.
 */

export * from './error.js';
export * from './common.js';
export * from './roles.js';
export * from './auth.js';
export * from './workspaces.js';
export * from './projects.js';
export * from './documents.js';
export * from './publish.js';
