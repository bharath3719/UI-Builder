/**
 * Tree operations — PLAN.md §3.
 *
 * Every function here is pure: it takes a tree and returns a new one, sharing the nodes
 * it did not touch. That buys three things at once — unit tests that need no React,
 * server-side validation that can replay the same edit the studio made, and an undo stack
 * that is just an array of previous values.
 *
 * The tree operations are generic over {@link NodeTree}, which is what a `Page` and a
 * `SymbolDef` have in common, and each returns the same type it was given. A symbol is
 * edited by the same canvas, the same layers tree and the same drag controller as a page,
 * so it has to be edited by the same `moveNode` — two copies that agree today are two
 * copies that stop agreeing the first time one of them is fixed. The operations below the
 * fold still name `Page`, because page state and queries are the part the two genuinely
 * differ about.
 *
 * Operations that cannot be satisfied throw. The studio is expected to have already
 * decided a drop is legal (`canMoveInto`) before committing it, so a throw here means
 * a bug rather than a user mistake.
 */

import {
  cloneJson,
  createNodeId,
  type ActionStep,
  type Json,
  type Node,
  type NodeId,
  type NodeTree,
  type Page,
  type PropValue,
  type QueryDef,
  type RepeatSpec,
  type StateVar,
  type StyleState,
} from './doc.js';
import { isValidVarName, uniqueVarName } from './expr.js';

export class DocumentError extends Error {
  override name = 'DocumentError';
}

function fail(message: string): never {
  throw new DocumentError(message);
}

/** Reads a node, throwing rather than returning undefined for an unknown id. */
export function getNode(tree: NodeTree, id: NodeId): Node {
  return tree.nodes[id] ?? fail(`node ${id} is not in this tree`);
}

/** Root -> node, inclusive. Used by the layers tree and by selection breadcrumbs. */
export function nodePath(tree: NodeTree, id: NodeId): Node[] {
  const path: Node[] = [];
  let current: Node | undefined = tree.nodes[id];
  while (current) {
    path.unshift(current);
    current = current.parentId ? tree.nodes[current.parentId] : undefined;
  }
  return path;
}

/**
 * Every id beneath `id`, excluding `id` itself, in depth-first pre-order — the order
 * the layers tree shows and the order a copied subtree must be rebuilt in.
 *
 * Children go onto the stack reversed so the first child comes off first; a plain
 * push would visit siblings backwards.
 */
export function descendantIds(tree: NodeTree, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const stack = [...(tree.nodes[id]?.children ?? [])].reverse();
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined) break;
    out.push(next);
    stack.push(...[...(tree.nodes[next]?.children ?? [])].reverse());
  }
  return out;
}

export function isDescendant(tree: NodeTree, ancestorId: NodeId, id: NodeId): boolean {
  let current = tree.nodes[id];
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = tree.nodes[current.parentId];
  }
  return false;
}

/**
 * The nodes of a selection that are not inside another node of it, in document order.
 *
 * Every operation that acts on a whole selection needs this, because a selection is a
 * set of ids and a document is a tree: selecting a stack and a button inside it and
 * pressing Delete must delete the stack once, not delete the stack and then throw
 * looking for a button that went with it. Duplicating would otherwise copy the button
 * twice, and moving would tear it out of the parent that is itself being moved.
 *
 * Unknown ids are dropped rather than throwing: a selection is studio state and can
 * outlive an undo that removed what it pointed at.
 *
 * Pre-order rather than the order the ids arrived in, because that is the order the
 * results are inserted in — a multi-node drop has to land in the order the layers tree
 * showed, not in the order the user happened to click.
 */
export function topmostNodes(tree: NodeTree, ids: Iterable<NodeId>): NodeId[] {
  const wanted = new Set(ids);
  if (wanted.size === 0) return [];

  const out: NodeId[] = [];
  const stack: NodeId[] = [tree.rootId];

  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined) break;

    // Taking a node means not descending into it: anything below is already covered.
    if (wanted.has(id)) {
      out.push(id);
      continue;
    }

    // Reversed so the first child comes off the stack first, as in `descendantIds`.
    stack.push(...[...(tree.nodes[id]?.children ?? [])].reverse());
  }

  return out;
}

/**
 * The guard behind every drag: a node may not be dropped into itself or into its own
 * subtree, which would detach that subtree from the document entirely.
 */
export function canMoveInto(tree: NodeTree, nodeId: NodeId, newParentId: NodeId): boolean {
  if (nodeId === newParentId) return false;
  if (!tree.nodes[nodeId] || !tree.nodes[newParentId]) return false;
  return !isDescendant(tree, nodeId, newParentId);
}

function withNodes<T extends NodeTree>(tree: T, nodes: Record<NodeId, Node>): T {
  return { ...tree, nodes };
}

/** Replaces one node, leaving every sibling object identical by reference. */
function setNode(nodes: Record<NodeId, Node>, node: Node): Record<NodeId, Node> {
  return { ...nodes, [node.id]: node };
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.trunc(index), length);
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

export interface InsertNodeArgs {
  node: Node;
  parentId: NodeId;
  /** Position among the parent's existing children. Clamped; omit to append. */
  index?: number;
}

/**
 * Inserts a new node (and, if it already carries children, its whole subtree — which
 * is how `duplicateNode` and paste reuse this path).
 */
export function insertNode<T extends NodeTree>(
  tree: T,
  { node, parentId, index }: InsertNodeArgs,
): T {
  const parent = getNode(tree, parentId);
  if (tree.nodes[node.id]) fail(`node ${node.id} is already in this tree`);

  const at = clampIndex(index ?? parent.children.length, parent.children.length);
  const children = [...parent.children];
  children.splice(at, 0, node.id);

  let nodes = setNode(tree.nodes, { ...node, parentId });
  nodes = setNode(nodes, { ...parent, children });
  return withNodes(tree, nodes);
}

/** Inserts a detached subtree whose nodes already reference one another. */
export function insertSubtree<T extends NodeTree>(
  tree: T,
  args: { nodes: Node[]; rootId: NodeId; parentId: NodeId; index?: number },
): T {
  const root = args.nodes.find((node) => node.id === args.rootId);
  if (!root) fail(`subtree root ${args.rootId} is not among the nodes given`);

  let nodes = { ...tree.nodes };
  for (const node of args.nodes) {
    if (nodes[node.id]) fail(`node ${node.id} is already in this tree`);
    nodes[node.id] = node;
  }

  const parent = getNode(tree, args.parentId);
  const at = clampIndex(args.index ?? parent.children.length, parent.children.length);
  const children = [...parent.children];
  children.splice(at, 0, root.id);

  nodes = setNode(nodes, { ...root, parentId: args.parentId });
  nodes = setNode(nodes, { ...parent, children });
  return withNodes(tree, nodes);
}

export interface MoveNodeArgs {
  nodeId: NodeId;
  newParentId: NodeId;
  /**
   * The position the node should end up at, counted against the target's children
   * **as they are now** — i.e. the list the drop indicator was drawn over, including
   * the dragged node itself when it is already a child of that parent.
   *
   * Reordering within one parent is where this matters: dragging child 0 to sit
   * after child 3 gives index 4, and the move compensates for its own removal.
   * Making the caller pre-adjust is the classic source of off-by-one drops.
   */
  index?: number;
}

export function moveNode<T extends NodeTree>(
  tree: T,
  { nodeId, newParentId, index }: MoveNodeArgs,
): T {
  const node = getNode(tree, nodeId);
  const newParent = getNode(tree, newParentId);
  if (node.parentId === null) fail('the root node cannot be moved');
  if (!canMoveInto(tree, nodeId, newParentId)) {
    fail(`node ${nodeId} cannot be moved into its own subtree`);
  }

  const oldParent = getNode(tree, node.parentId);
  const sameParent = oldParent.id === newParent.id;

  let target = clampIndex(index ?? newParent.children.length, newParent.children.length);

  const oldIndex = oldParent.children.indexOf(nodeId);
  if (oldIndex === -1) fail(`node ${nodeId} is missing from its parent's children`);
  if (sameParent && oldIndex < target) target -= 1;

  const detached = oldParent.children.filter((id) => id !== nodeId);
  const nextChildren = sameParent ? detached : [...newParent.children];
  nextChildren.splice(Math.min(target, nextChildren.length), 0, nodeId);

  let nodes = tree.nodes;
  if (sameParent) {
    nodes = setNode(nodes, { ...oldParent, children: nextChildren });
  } else {
    nodes = setNode(nodes, { ...oldParent, children: detached });
    nodes = setNode(nodes, { ...newParent, children: nextChildren });
  }
  nodes = setNode(nodes, { ...node, parentId: newParentId });

  return withNodes(tree, nodes);
}

/**
 * Moves a whole selection to one place, keeping it in document order and contiguous.
 *
 * The index arithmetic is the reason this is an operation rather than a loop at the
 * call site. Each node after the first goes *immediately after the one before it*,
 * which is `indexOf(previous) + 1` counted against the children as they then are —
 * and `moveNode` already compensates for a node being lifted out of a position before
 * its target, so that one expression is correct whether the node was above or below
 * the drop point to begin with.
 *
 * Nodes that cannot make the move are skipped rather than fatal: dropping a selection
 * into one of its own members is a thing a user can ask for, and the answer is that
 * the others still move.
 */
export function moveNodes<T extends NodeTree>(
  tree: T,
  ids: Iterable<NodeId>,
  newParentId: NodeId,
  index?: number,
): T {
  let next = tree;
  let target = index;

  for (const nodeId of topmostNodes(tree, ids)) {
    if (next.nodes[nodeId]?.parentId === null) continue;
    if (!canMoveInto(next, nodeId, newParentId)) continue;

    next = moveNode(next, { nodeId, newParentId, index: target });
    const landed = next.nodes[newParentId]?.children.indexOf(nodeId) ?? -1;
    target = landed === -1 ? target : landed + 1;
  }

  return next;
}

/** Removes a node and everything under it. The root cannot be deleted. */
export function deleteNode<T extends NodeTree>(tree: T, nodeId: NodeId): T {
  const node = getNode(tree, nodeId);
  if (node.parentId === null) fail('the root node cannot be deleted');

  const doomed = new Set([nodeId, ...descendantIds(tree, nodeId)]);
  const nodes: Record<NodeId, Node> = {};
  for (const [id, existing] of Object.entries(tree.nodes)) {
    if (!doomed.has(id)) nodes[id] = existing;
  }

  const parent = getNode(tree, node.parentId);
  nodes[parent.id] = { ...parent, children: parent.children.filter((id) => id !== nodeId) };

  return withNodes(tree, nodes);
}

export function reorder<T extends NodeTree>(
  tree: T,
  parentId: NodeId,
  from: number,
  to: number,
): T {
  const parent = getNode(tree, parentId);
  const children = [...parent.children];
  if (from < 0 || from >= children.length) fail(`no child at index ${from}`);

  const [moved] = children.splice(from, 1);
  if (moved === undefined) fail(`no child at index ${from}`);
  children.splice(clampIndex(to, children.length), 0, moved);

  return withNodes(tree, setNode(tree.nodes, { ...parent, children }));
}

/**
 * Deep-copies a subtree with fresh ids and drops it in directly after the original.
 *
 * `newId` is injectable so tests can assert on the resulting shape rather than on
 * whatever random ids the copy happened to get.
 */
export function duplicateNode<T extends NodeTree>(
  tree: T,
  nodeId: NodeId,
  newId: () => NodeId = createNodeId,
): T {
  const node = getNode(tree, nodeId);
  if (node.parentId === null) fail('the root node cannot be duplicated');

  const idMap = new Map<NodeId, NodeId>();
  for (const id of [nodeId, ...descendantIds(tree, nodeId)]) idMap.set(id, newId());

  const copies: Node[] = [];
  for (const [oldId, freshId] of idMap) {
    const source = getNode(tree, oldId);
    copies.push({
      ...source,
      id: freshId,
      parentId: source.parentId ? (idMap.get(source.parentId) ?? source.parentId) : null,
      children: source.children.map((child) => idMap.get(child) ?? child),
      props: { ...source.props },
      styles: cloneJson(source.styles),
      events: cloneJson(source.events),
      // Conditional rather than always written: a copy of a node with no repeat must
      // not gain a `repeat: undefined` key, or it stops comparing equal to one.
      ...(source.repeat === undefined ? {} : { repeat: cloneJson(source.repeat) }),
      ...(source.showIf === undefined ? {} : { showIf: cloneJson(source.showIf) }),
    });
  }

  const parent = getNode(tree, node.parentId);
  const rootId = idMap.get(nodeId);
  if (rootId === undefined) fail('duplicate lost its own root');

  return insertSubtree(tree, {
    nodes: copies,
    rootId,
    parentId: parent.id,
    index: parent.children.indexOf(nodeId) + 1,
  });
}

/** Renames a layer. Kept as an op so the layers tree and undo share one path. */
export function renameNode<T extends NodeTree>(tree: T, nodeId: NodeId, name: string): T {
  const node = getNode(tree, nodeId);
  return withNodes(tree, setNode(tree.nodes, { ...node, name }));
}

/**
 * Sets or clears the two layer flags the outline toggles.
 *
 * Clearing removes the key rather than storing `false`, because `makeNode` only writes
 * these when they are set: a node that was hidden and then shown must end up in the
 * same shape as one that was never hidden, or every document comparison — undo, the
 * dirty check, the revision diff — sees a change that is not one.
 */
export function setNodeFlags<T extends NodeTree>(
  tree: T,
  nodeId: NodeId,
  flags: { hidden?: boolean; locked?: boolean },
): T {
  const node = getNode(tree, nodeId);
  const next: Node = { ...node };

  for (const flag of ['hidden', 'locked'] as const) {
    const value = flags[flag];
    if (value === undefined) continue;
    if (value) next[flag] = true;
    else delete next[flag];
  }

  return withNodes(tree, setNode(tree.nodes, next));
}

/**
 * Whether a node is locked, by its own flag or by an ancestor's.
 *
 * Locking a container locks what it contains. The alternative — a lock that covers
 * only the node it is set on — means locking a card still leaves every click inside it
 * able to drag the heading out of it, which is the thing the lock was set to prevent.
 */
export function isLocked(tree: NodeTree, id: NodeId): boolean {
  let current: Node | undefined = tree.nodes[id];
  while (current) {
    if (current.locked) return true;
    current = current.parentId ? tree.nodes[current.parentId] : undefined;
  }
  return false;
}

/**
 * Sets one prop, or removes it when the value is `undefined`.
 *
 * Removing rather than writing a null is what makes "reset" mean the component's own
 * default again: a stored null is a value, and the inspector would go on reporting
 * the prop as overridden with nothing to show for it.
 */
export function setNodeProp<T extends NodeTree>(
  tree: T,
  nodeId: NodeId,
  name: string,
  value: Node['props'][string] | undefined,
): T {
  const node = getNode(tree, nodeId);
  const props = { ...node.props };

  if (value === undefined) delete props[name];
  else props[name] = value;

  return withNodes(tree, setNode(tree.nodes, { ...node, props }));
}

/**
 * Merges declarations into one breakpoint/state bucket. A declaration set to
 * `undefined` is removed, which is how the inspector clears a field back to the
 * component's default rather than pinning it to an explicit value.
 */
export function setNodeStyles<T extends NodeTree>(
  tree: T,
  nodeId: NodeId,
  args: {
    breakpoint?: string;
    state?: StyleState;
    decls: Record<string, string | number | undefined>;
  },
): T {
  const node = getNode(tree, nodeId);
  const breakpoint = args.breakpoint ?? 'base';
  const state = args.state ?? 'default';

  const bucket = { ...(node.styles[breakpoint]?.[state] ?? {}) };
  for (const [property, value] of Object.entries(args.decls)) {
    if (value === undefined) delete bucket[property];
    else bucket[property] = value;
  }

  const styles = {
    ...node.styles,
    [breakpoint]: { ...node.styles[breakpoint], [state]: bucket },
  };

  return withNodes(tree, setNode(tree.nodes, { ...node, styles }));
}

/* -------------------------------------------------------------------------- */
/* Bindings — PLAN.md §10                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Writes one event handler, or removes it when the steps are gone.
 *
 * An empty list removes the key rather than storing `[]`, for `setNodeFlags`' reason: a
 * node whose last step was deleted must end up in the same shape as one that never had
 * a handler, or undo, the dirty check and the revision diff all see a change that is
 * not one.
 */
export function setNodeEvent<T extends NodeTree>(
  tree: T,
  nodeId: NodeId,
  event: string,
  steps: ActionStep[] | undefined,
): T {
  const node = getNode(tree, nodeId);
  const events = { ...node.events };

  if (steps === undefined || steps.length === 0) delete events[event];
  else events[event] = steps;

  return withNodes(tree, setNode(tree.nodes, { ...node, events }));
}

/**
 * Makes a node render once per item of a collection, or stops it.
 *
 * The root cannot repeat: it *is* the page, and a page rendered three times is three
 * documents. Refusing here rather than in the panel keeps the rule with the model, the
 * same way `deleteNode` owns "the root cannot be deleted".
 */
export function setNodeRepeat<T extends NodeTree>(
  tree: T,
  nodeId: NodeId,
  repeat: RepeatSpec | undefined,
): T {
  const node = getNode(tree, nodeId);
  if (node.parentId === null) fail('the root node cannot repeat');

  const next: Node = { ...node };
  if (repeat === undefined) delete next.repeat;
  else next.repeat = repeat;

  return withNodes(tree, setNode(tree.nodes, next));
}

/** Sets or clears the condition a node's rendering hangs on. */
export function setNodeShowIf<T extends NodeTree>(
  tree: T,
  nodeId: NodeId,
  condition: PropValue | undefined,
): T {
  const node = getNode(tree, nodeId);

  const next: Node = { ...node };
  if (condition === undefined) delete next.showIf;
  else next.showIf = condition;

  return withNodes(tree, setNode(tree.nodes, next));
}

/* -------------------------------------------------------------------------- */
/* Page state                                                                  */
/* -------------------------------------------------------------------------- */

/** What a variable of each type starts as before the author types anything. */
export function defaultStateValue(type: StateVar['type']): Json {
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'json':
      return null;
  }
}

export function findStateVar(page: Page, id: string): StateVar | undefined {
  return page.state.find((variable) => variable.id === id);
}

export function findStateVarByName(page: Page, name: string): StateVar | undefined {
  return page.state.find((variable) => variable.name === name);
}

/**
 * A detached variable with a name that is free as of `page` — not added: see
 * `addStateVar`.
 *
 * Two steps for `copyPage`'s reason. Ids must be minted *outside* a React state updater,
 * because an updater can run more than once and a second run would produce a different
 * id, leaving the caller holding one the committed document does not contain.
 */
export function createStateVar(
  page: Page,
  init: Partial<Omit<StateVar, 'id'>> = {},
  newId: () => string = createNodeId,
): StateVar {
  const type = init.type ?? 'string';
  return {
    id: newId(),
    name: uniqueVarName(
      page.state.map((variable) => variable.name),
      init.name ?? 'value',
    ),
    type,
    initial: init.initial ?? defaultStateValue(type),
  };
}

export function addStateVar(page: Page, variable: StateVar, index?: number): Page {
  if (findStateVar(page, variable.id)) fail(`state ${variable.id} is already on this page`);
  if (!isValidVarName(variable.name)) fail(`${variable.name} is not a usable variable name`);
  if (findStateVarByName(page, variable.name)) fail(`${variable.name} is already in use`);

  const state = [...page.state];
  state.splice(clampIndex(index ?? state.length, state.length), 0, variable);
  return { ...page, state };
}

/**
 * Edits a variable in place.
 *
 * A rename is not propagated into expressions, and cannot be: an expression is free-form
 * text, and a search-and-replace over it would happily rewrite the inside of a string
 * literal. `collectExpressions` (expr.ts) is how the panel warns *before* the rename
 * instead — the honest answer, since the model has no way to know that `state.count` in
 * a template means this variable rather than a word.
 */
export function updateStateVar(page: Page, id: string, patch: Partial<Omit<StateVar, 'id'>>): Page {
  const index = page.state.findIndex((variable) => variable.id === id);
  if (index === -1) fail(`state ${id} is not on this page`);

  const current = page.state[index]!;
  const next: StateVar = { ...current, ...patch };

  if (!isValidVarName(next.name)) fail(`${next.name} is not a usable variable name`);
  const clash = findStateVarByName(page, next.name);
  if (clash && clash.id !== id) fail(`${next.name} is already in use`);

  const state = [...page.state];
  state[index] = next;
  return { ...page, state };
}

/**
 * Removes a variable, and with it every action step that targeted it.
 *
 * The cascade is `deleteNode`'s: a `setState` step pointing at a variable that is gone
 * is a handler that silently does nothing, and leaving one behind would mean every
 * reader of a document had to tolerate a dangling id. Expressions that named it are
 * *not* touched, for the reason `updateStateVar` gives — which is what the panel's
 * usage list is for.
 */
export function removeStateVar(page: Page, id: string): Page {
  if (!findStateVar(page, id)) fail(`state ${id} is not on this page`);

  const pruned = pruneSteps(
    page,
    (step) => (step.kind === 'setState' || step.kind === 'toggleState') && step.stateId === id,
  );

  return { ...pruned, state: pruned.state.filter((variable) => variable.id !== id) };
}

/* -------------------------------------------------------------------------- */
/* Page queries                                                                */
/* -------------------------------------------------------------------------- */

export function findQuery(page: Page, id: string): QueryDef | undefined {
  return page.queries.find((query) => query.id === id);
}

export function createQuery(
  page: Page,
  init: Partial<Omit<QueryDef, 'id'>> = {},
  newId: () => string = createNodeId,
): QueryDef {
  return {
    id: newId(),
    name: uniqueVarName(
      page.queries.map((query) => query.name),
      init.name ?? 'query',
    ),
    method: init.method ?? 'GET',
    url: init.url ?? '',
    ...(init.headers === undefined ? {} : { headers: init.headers }),
    ...(init.body === undefined ? {} : { body: init.body }),
    runOnLoad: init.runOnLoad ?? true,
  };
}

export function addQuery(page: Page, query: QueryDef, index?: number): Page {
  if (findQuery(page, query.id)) fail(`query ${query.id} is already on this page`);
  if (!isValidVarName(query.name)) fail(`${query.name} is not a usable query name`);
  if (page.queries.some((existing) => existing.name === query.name)) {
    fail(`${query.name} is already in use`);
  }

  const queries = [...page.queries];
  queries.splice(clampIndex(index ?? queries.length, queries.length), 0, query);
  return { ...page, queries };
}

export function updateQuery(page: Page, id: string, patch: Partial<Omit<QueryDef, 'id'>>): Page {
  const index = page.queries.findIndex((query) => query.id === id);
  if (index === -1) fail(`query ${id} is not on this page`);

  const next: QueryDef = { ...page.queries[index]!, ...patch };

  if (!isValidVarName(next.name)) fail(`${next.name} is not a usable query name`);
  if (page.queries.some((query) => query.name === next.name && query.id !== id)) {
    fail(`${next.name} is already in use`);
  }

  const queries = [...page.queries];
  queries[index] = next;
  return { ...page, queries };
}

/** Removes a query, and with it every `runQuery` step that pointed at it. */
export function removeQuery(page: Page, id: string): Page {
  if (!findQuery(page, id)) fail(`query ${id} is not on this page`);

  const pruned = pruneSteps(page, (step) => step.kind === 'runQuery' && step.queryId === id);
  return { ...pruned, queries: pruned.queries.filter((query) => query.id !== id) };
}

/**
 * Drops every action step matching a predicate, across every handler on the page, and
 * removes the handlers that are left empty.
 *
 * Shared by the two cascades above rather than written twice, because "and also remove
 * the event key when its last step goes" is exactly the clause a second copy forgets.
 */
export function pruneSteps<T extends NodeTree>(tree: T, doomed: (step: ActionStep) => boolean): T {
  let nodes = tree.nodes;

  for (const node of Object.values(tree.nodes)) {
    let changed = false;
    const events: Record<string, ActionStep[]> = {};

    for (const [event, steps] of Object.entries(node.events)) {
      const kept = steps.filter((step) => !doomed(step));
      if (kept.length !== steps.length) changed = true;
      if (kept.length > 0) events[event] = kept;
    }

    if (changed) nodes = setNode(nodes, { ...node, events });
  }

  return nodes === tree.nodes ? tree : withNodes(tree, nodes);
}
