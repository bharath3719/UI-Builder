/**
 * Document-level page operations — PLAN.md §3, the sibling of `ops.ts`.
 *
 * Separate from `ops.ts` because the unit is different: every function there takes a
 * `Page` and returns a `Page`, and every function here takes a `ProjectDoc` and returns
 * a `ProjectDoc`. Mixing the two behind one import would mean each call site has to
 * remember which shape it is holding, and the studio's edit path — which wraps a page
 * transform in a document — would have no way to tell them apart.
 *
 * The same rules apply: pure, structurally sharing everything untouched, and throwing
 * on what cannot be satisfied. A page is not created here for the reason a node is not
 * created in `ops.ts` — a blank page is made of real components, and this package is
 * not allowed to know that any exist (`createPage` lives in `@ui-builder/components`).
 */

import {
  cloneJson,
  createNodeId,
  type Node,
  type NodeId,
  type Page,
  type ProjectDoc,
} from './doc.js';
import { DocumentError } from './ops.js';

function fail(message: string): never {
  throw new DocumentError(message);
}

/** Where a page sits in the document, or -1. */
export function pageIndexOf(doc: ProjectDoc, pageId: string): number {
  return doc.pages.findIndex((page) => page.id === pageId);
}

export function findPage(doc: ProjectDoc, pageId: string): Page | undefined {
  return doc.pages.find((page) => page.id === pageId);
}

/** Reads a page, throwing rather than returning undefined for an unknown id. */
export function getPage(doc: ProjectDoc, pageId: string): Page {
  return findPage(doc, pageId) ?? fail(`page ${pageId} is not in this document`);
}

/**
 * A route path in the one shape everything downstream expects: leading slash, no
 * trailing slash, no doubled or internal whitespace.
 *
 * Normalised on the way in rather than tolerated on the way out, because the path is
 * read by three things that would each have to forgive a different set of mistakes —
 * the exported router, the preview, and the uniqueness check below. `/about/` and
 * `/about` naming two different pages is a routing bug the user cannot see.
 *
 * Case is deliberately preserved: `:id` segments are part of the path and lowercasing
 * a whole path to tidy it would silently rewrite them.
 */
export function normalizePagePath(input: string): string {
  const cleaned = input.trim().replace(/\s+/g, '-');
  const segments = cleaned.split('/').filter((segment) => segment !== '');
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

/**
 * Whether a path is free — the `canMoveInto` of this module.
 *
 * `exceptPageId` is the page being edited, so that saving a page's own path unchanged
 * is not a collision with itself.
 */
export function pagePathAvailable(doc: ProjectDoc, path: string, exceptPageId?: string): boolean {
  const wanted = normalizePagePath(path);
  return !doc.pages.some((page) => page.id !== exceptPageId && page.path === wanted);
}

/**
 * `/about` -> `/about-2` when `/about` is taken.
 *
 * Used for the defaults a new or duplicated page opens with. A suggestion, not a rule:
 * `setPagePath` still refuses a collision, because a path the user typed themselves
 * should be rejected rather than quietly changed into a different one.
 */
export function uniquePagePath(doc: ProjectDoc, base: string): string {
  const wanted = normalizePagePath(base);
  if (pagePathAvailable(doc, wanted)) return wanted;

  // '/' has no stem worth suffixing — `/-2` is not a path — so a taken root falls back
  // to a word first, and only then starts counting.
  const stem = wanted === '/' ? '/page' : wanted;
  if (stem !== wanted && pagePathAvailable(doc, stem)) return stem;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}-${suffix}`;
    if (pagePathAvailable(doc, candidate)) return candidate;
  }
}

/**
 * `Home` -> `Home 2` when `Home` is taken.
 *
 * Names are labels, not keys — two pages may legitimately share one, and codegen
 * de-duplicates the component names it derives from them. This only keeps the default
 * for a *new* page from arriving pre-ambiguous.
 */
export function uniquePageName(doc: ProjectDoc, base: string): string {
  const taken = new Set(doc.pages.map((page) => page.name));
  if (!taken.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Replaces one page, leaving every other page the same object. */
function withPage(doc: ProjectDoc, index: number, page: Page): ProjectDoc {
  if (doc.pages[index] === page) return doc;
  const pages = [...doc.pages];
  pages[index] = page;
  return { ...doc, pages };
}

/**
 * Writes a page transform into the document at `pageId`.
 *
 * This is the seam between the two modules: `ops.ts` speaks `Page`, storage speaks
 * `ProjectDoc`, and every editor mutation crosses here exactly once.
 */
export function updatePage(
  doc: ProjectDoc,
  pageId: string,
  transform: (page: Page) => Page,
): ProjectDoc {
  const index = pageIndexOf(doc, pageId);
  if (index === -1) fail(`page ${pageId} is not in this document`);
  return withPage(doc, index, transform(doc.pages[index]!));
}

export interface AddPageArgs {
  page: Page;
  /** Defaults to the end. Clamped, so a caller need not know the current length. */
  index?: number;
}

export function addPage(doc: ProjectDoc, { page, index }: AddPageArgs): ProjectDoc {
  if (pageIndexOf(doc, page.id) !== -1) fail(`page ${page.id} is already in this document`);
  if (!pagePathAvailable(doc, page.path)) fail(`the path ${page.path} is already in use`);
  if (!page.nodes[page.rootId]) fail('a page must contain its own root node');

  const pages = [...doc.pages];
  const at = index === undefined ? pages.length : Math.max(0, Math.min(index, pages.length));
  pages.splice(at, 0, { ...page, path: normalizePagePath(page.path) });
  return { ...doc, pages };
}

/**
 * Removes a page.
 *
 * The last page cannot go: `ProjectDocSchema` requires at least one, so a document with
 * none would fail validation on the next autosave — the delete would appear to work and
 * then take the whole project's saving with it.
 */
export function deletePage(doc: ProjectDoc, pageId: string): ProjectDoc {
  const index = pageIndexOf(doc, pageId);
  if (index === -1) fail(`page ${pageId} is not in this document`);
  if (doc.pages.length === 1) fail('a document must keep at least one page');

  return { ...doc, pages: doc.pages.filter((page) => page.id !== pageId) };
}

export function renamePage(doc: ProjectDoc, pageId: string, name: string): ProjectDoc {
  return updatePage(doc, pageId, (page) => (page.name === name ? page : { ...page, name }));
}

/**
 * Changes a page's route.
 *
 * Refuses a path another page already holds. Two `<Route path="/x">` entries is not a
 * cosmetic problem — the exported router matches the first and the second page becomes
 * unreachable, with nothing on screen to say why.
 */
export function setPagePath(doc: ProjectDoc, pageId: string, path: string): ProjectDoc {
  const wanted = normalizePagePath(path);
  if (!pagePathAvailable(doc, wanted, pageId)) fail(`the path ${wanted} is already in use`);
  return updatePage(doc, pageId, (page) =>
    page.path === wanted ? page : { ...page, path: wanted },
  );
}

/** Reorders the page list. Order is presentation only — routes match on path. */
export function movePage(doc: ProjectDoc, from: number, to: number): ProjectDoc {
  if (from < 0 || from >= doc.pages.length) fail(`no page at index ${from}`);

  const pages = [...doc.pages];
  const [moved] = pages.splice(from, 1);
  if (moved === undefined) fail(`no page at index ${from}`);
  pages.splice(Math.max(0, Math.min(to, pages.length)), 0, moved);

  return { ...doc, pages };
}

/**
 * A detached deep copy of a page — every node with a fresh id, and a name and path that
 * are free as of `doc`. Not inserted: see `duplicatePage`.
 *
 * The two steps are separate because the caller that matters is React. Ids must be
 * generated *outside* a state updater — an updater can run more than once, and a second
 * run would mint a different set, leaving the caller holding an id the committed
 * document does not contain. So the studio takes the copy here, then inserts it inside
 * the updater, exactly as it creates a node before the drop that inserts it.
 *
 * The ids have to be new even though the copy lives on a different page: node ids are
 * what CSS Module class names are built from (`nodeClassName`), and codegen writes one
 * stylesheet per page from those. Two pages sharing an id would be two files declaring
 * the same class, which is fine right up until someone flattens them.
 *
 * `newId` is injectable for the same reason `duplicateNode`'s is — so a test can assert
 * on shape rather than on whatever randomness produced.
 */
export function copyPage(
  doc: ProjectDoc,
  pageId: string,
  newId: () => NodeId = createNodeId,
): Page {
  const source = getPage(doc, pageId);

  const idMap = new Map<NodeId, NodeId>();
  for (const id of Object.keys(source.nodes)) idMap.set(id, newId());

  const nodes: Record<NodeId, Node> = {};
  for (const [oldId, freshId] of idMap) {
    const node = source.nodes[oldId]!;
    nodes[freshId] = {
      ...node,
      id: freshId,
      parentId: node.parentId ? (idMap.get(node.parentId) ?? node.parentId) : null,
      children: node.children.map((child) => idMap.get(child) ?? child),
      props: { ...node.props },
      styles: cloneJson(node.styles),
      events: cloneJson(node.events),
    };
  }

  const rootId = idMap.get(source.rootId);
  if (rootId === undefined) fail('the copy lost its own root');

  return {
    id: newId(),
    name: uniquePageName(doc, source.name),
    path: uniquePagePath(doc, source.path),
    rootId,
    nodes,
    // State and query ids are deliberately *not* freshened, unlike node ids. They are
    // looked up only within their own page, so a duplicate holding the same ids is
    // unambiguous — and keeping them is what lets the copied nodes' action steps go on
    // resolving without every `stateId` in the subtree being rewritten. Node ids have to
    // change for a different reason entirely: they become CSS class names.
    state: cloneJson(source.state),
    queries: cloneJson(source.queries),
  };
}

/** Copies a page and drops it in directly after the original. */
export function duplicatePage(
  doc: ProjectDoc,
  pageId: string,
  newId: () => NodeId = createNodeId,
): ProjectDoc {
  return addPage(doc, {
    page: copyPage(doc, pageId, newId),
    index: pageIndexOf(doc, pageId) + 1,
  });
}
