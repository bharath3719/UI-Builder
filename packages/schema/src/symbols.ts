/**
 * Reusable user components — PLAN.md §12, the third sibling of `ops.ts` and `pages.ts`.
 *
 * The unit here is the document: a symbol belongs to the project rather than to a page,
 * because a component used on one page only is a subtree, and what makes symbols worth
 * building is the card that appears on four pages and is edited once.
 *
 * The node tree inside a symbol is edited by `ops.ts`, unchanged — a `SymbolDef` is a
 * `NodeTree`, and those operations are generic over it. What lives here is everything
 * that is *not* a tree edit: the prop surface, the instances scattered across the
 * document, and the rule that a component may not contain itself.
 *
 * Pure and structurally sharing, like its siblings. A symbol is not created here for the
 * reason a page is not created in `pages.ts`: its root is made of a real component, and
 * this package is not allowed to know that any exist (`createSymbol` lives in
 * `@ui-builder/components`).
 */

import {
  cloneJson,
  createNodeId,
  symbolIdOf,
  symbolType,
  type Json,
  type Node,
  type NodeId,
  type NodeTree,
  type ProjectDoc,
  type SymbolDef,
  type SymbolProp,
  type SymbolPropType,
} from './doc.js';
import { isValidVarName, toPropLabel, uniqueVarName } from './expr.js';
import { DocumentError } from './ops.js';

function fail(message: string): never {
  throw new DocumentError(message);
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export function symbolIndexOf(doc: ProjectDoc, symbolId: string): number {
  return doc.symbols.findIndex((symbol) => symbol.id === symbolId);
}

export function findSymbol(doc: ProjectDoc, symbolId: string): SymbolDef | undefined {
  return doc.symbols.find((symbol) => symbol.id === symbolId);
}

/** Reads a symbol, throwing rather than returning undefined for an unknown id. */
export function getSymbol(doc: ProjectDoc, symbolId: string): SymbolDef {
  return findSymbol(doc, symbolId) ?? fail(`symbol ${symbolId} is not in this document`);
}

/** Where an instance of a symbol sits — which tree, and which node. */
export interface SymbolInstance {
  /** The page or symbol holding it. */
  treeId: string;
  treeKind: 'page' | 'symbol';
  treeName: string;
  nodeId: NodeId;
  nodeName: string;
}

/**
 * Every instance of a symbol in the document.
 *
 * What the panel counts before offering to delete one, and what makes that offer honest:
 * "used in 3 places" is a fact the author can check, and a delete that quietly took three
 * nodes with it is not.
 */
export function symbolInstances(doc: ProjectDoc, symbolId: string): SymbolInstance[] {
  const type = symbolType(symbolId);
  const out: SymbolInstance[] = [];

  const scan = (treeId: string, treeKind: 'page' | 'symbol', treeName: string, tree: NodeTree) => {
    for (const node of Object.values(tree.nodes)) {
      if (node.type === type) {
        out.push({ treeId, treeKind, treeName, nodeId: node.id, nodeName: node.name });
      }
    }
  };

  for (const page of doc.pages) scan(page.id, 'page', page.name, page);
  for (const symbol of doc.symbols) scan(symbol.id, 'symbol', symbol.name, symbol);

  return out;
}

/**
 * Which symbols each symbol renders, directly.
 *
 * The edge list the cycle check walks. Built from the node types rather than tracked as
 * the document is edited, because a derived answer cannot go stale and there is no size
 * of document where walking it costs anything.
 */
export function symbolDependencies(doc: ProjectDoc): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();

  for (const symbol of doc.symbols) {
    const used = new Set<string>();
    for (const node of Object.values(symbol.nodes)) {
      const id = symbolIdOf(node.type);
      if (id !== null) used.add(id);
    }
    edges.set(symbol.id, used);
  }

  return edges;
}

/** Whether `from` renders `to`, directly or through other symbols. */
export function symbolReaches(doc: ProjectDoc, from: string, to: string): boolean {
  const edges = symbolDependencies(doc);
  const seen = new Set<string>();
  const pending = [...(edges.get(from) ?? [])];

  while (pending.length > 0) {
    const next = pending.pop()!;
    if (next === to) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    pending.push(...(edges.get(next) ?? []));
  }

  return false;
}

/**
 * Whether an instance of `symbolId` may be placed inside `hostSymbolId`.
 *
 * A component that contains itself is a renderer that does not terminate, so it is
 * refused where it is authored rather than guarded where it is drawn. `null` is a page,
 * which can hold anything: a page is never inside something else.
 *
 * The guard is the drag rules' (`canMoveInto`) at the level above — the same shape of
 * mistake one level up the containment hierarchy.
 */
export function canPlaceSymbol(
  doc: ProjectDoc,
  symbolId: string,
  hostSymbolId: string | null,
): boolean {
  if (hostSymbolId === null) return true;
  if (symbolId === hostSymbolId) return false;
  // Placing A inside B is a cycle exactly when A already reaches B.
  return !symbolReaches(doc, symbolId, hostSymbolId);
}

/* -------------------------------------------------------------------------- */
/* Names                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `Card` -> `Card 2` when `Card` is taken.
 *
 * Names are labels rather than keys — an instance names its symbol by id, so two symbols
 * called the same thing render correctly and `componentName` de-duplicates what they
 * export as. This only keeps a new symbol from arriving pre-ambiguous in the palette.
 */
export function uniqueSymbolName(doc: ProjectDoc, base: string): string {
  const taken = new Set(doc.symbols.map((symbol) => symbol.name));
  if (!taken.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/* -------------------------------------------------------------------------- */
/* The symbol list                                                             */
/* -------------------------------------------------------------------------- */

function withSymbol(doc: ProjectDoc, index: number, symbol: SymbolDef): ProjectDoc {
  if (doc.symbols[index] === symbol) return doc;
  const symbols = [...doc.symbols];
  symbols[index] = symbol;
  return { ...doc, symbols };
}

/**
 * Writes a symbol transform into the document.
 *
 * The seam `updatePage` is for the other tree: `ops.ts` speaks `NodeTree`, storage speaks
 * `ProjectDoc`, and every edit to a symbol's contents crosses here exactly once.
 */
export function updateSymbol(
  doc: ProjectDoc,
  symbolId: string,
  transform: (symbol: SymbolDef) => SymbolDef,
): ProjectDoc {
  const index = symbolIndexOf(doc, symbolId);
  if (index === -1) fail(`symbol ${symbolId} is not in this document`);
  return withSymbol(doc, index, transform(doc.symbols[index]!));
}

export function addSymbol(doc: ProjectDoc, symbol: SymbolDef, index?: number): ProjectDoc {
  if (symbolIndexOf(doc, symbol.id) !== -1) fail(`symbol ${symbol.id} is already in this document`);
  if (!symbol.nodes[symbol.rootId]) fail('a symbol must contain its own root node');

  const symbols = [...doc.symbols];
  const at = index === undefined ? symbols.length : Math.max(0, Math.min(index, symbols.length));
  symbols.splice(at, 0, symbol);
  return { ...doc, symbols };
}

export function renameSymbol(doc: ProjectDoc, symbolId: string, name: string): ProjectDoc {
  const trimmed = name.trim();
  if (trimmed === '') fail('a symbol needs a name');
  return updateSymbol(doc, symbolId, (symbol) =>
    symbol.name === trimmed ? symbol : { ...symbol, name: trimmed },
  );
}

export function setSymbolDescription(
  doc: ProjectDoc,
  symbolId: string,
  description: string,
): ProjectDoc {
  return updateSymbol(doc, symbolId, (symbol) =>
    symbol.description === description ? symbol : { ...symbol, description },
  );
}

/** Reorders the symbol list. Order is the palette's order and nothing else. */
export function moveSymbol(doc: ProjectDoc, from: number, to: number): ProjectDoc {
  if (from < 0 || from >= doc.symbols.length) fail(`no symbol at index ${from}`);

  const symbols = [...doc.symbols];
  const [moved] = symbols.splice(from, 1);
  if (moved === undefined) fail(`no symbol at index ${from}`);
  symbols.splice(Math.max(0, Math.min(to, symbols.length)), 0, moved);

  return { ...doc, symbols };
}

/**
 * Removes a symbol, and with it every instance of it in the document.
 *
 * The cascade is `removeStateVar`'s, one level up: an instance whose symbol is gone is a
 * node that renders the red unknown-component box, and leaving one behind would mean
 * every reader of a document had to tolerate a dangling reference forever. `deleteNode`
 * takes each instance's own subtree with it, which for an instance is nothing — the
 * contents belong to the symbol, not to the node that renders it.
 *
 * The count is knowable before the fact (`symbolInstances`), which is what lets the panel
 * ask first rather than the operation refuse.
 */
export function deleteSymbol(doc: ProjectDoc, symbolId: string): ProjectDoc {
  if (!findSymbol(doc, symbolId)) fail(`symbol ${symbolId} is not in this document`);

  const type = symbolType(symbolId);
  const prune = <T extends NodeTree>(tree: T): T => {
    const doomed = Object.values(tree.nodes).filter((node) => node.type === type);
    if (doomed.length === 0) return tree;

    const gone = new Set(doomed.map((node) => node.id));
    const nodes: Record<NodeId, Node> = {};
    for (const [id, node] of Object.entries(tree.nodes)) {
      if (gone.has(id)) continue;
      nodes[id] = node.children.some((child) => gone.has(child))
        ? { ...node, children: node.children.filter((child) => !gone.has(child)) }
        : node;
    }
    return { ...tree, nodes };
  };

  return {
    ...doc,
    pages: doc.pages.map(prune),
    symbols: doc.symbols.filter((symbol) => symbol.id !== symbolId).map(prune),
  };
}

/**
 * A detached deep copy of a symbol — every node with a fresh id, and a free name.
 *
 * Two steps for `copyPage`'s reason: ids must be minted outside a React state updater,
 * which can run twice and would otherwise leave the caller holding an id the committed
 * document does not contain. The node ids have to be new for `copyPage`'s other reason —
 * they become CSS class names, and a symbol writes its own stylesheet.
 *
 * Prop ids are kept, exactly as a duplicated page keeps its state ids: they are looked up
 * only within their own symbol, and the copied nodes' `props.<name>` expressions go on
 * resolving because nothing about the names moved.
 */
export function copySymbol(
  doc: ProjectDoc,
  symbolId: string,
  newId: () => NodeId = createNodeId,
): SymbolDef {
  const source = getSymbol(doc, symbolId);

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
    name: uniqueSymbolName(doc, source.name),
    description: source.description,
    rootId,
    nodes,
    props: cloneJson(source.props),
  };
}

/** Copies a symbol and drops it in directly after the original. */
export function duplicateSymbol(
  doc: ProjectDoc,
  symbolId: string,
  newId: () => NodeId = createNodeId,
): ProjectDoc {
  return addSymbol(doc, copySymbol(doc, symbolId, newId), symbolIndexOf(doc, symbolId) + 1);
}

/* -------------------------------------------------------------------------- */
/* The prop surface                                                            */
/* -------------------------------------------------------------------------- */

/** What a prop of each type starts as before the author types anything. */
export function defaultSymbolPropValue(type: SymbolPropType): Json {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      // string, text, color, url and enum are all authored as text, and an enum with no
      // options yet has no first option to fall back to.
      return '';
  }
}

/**
 * What a placement that sets nothing passes in.
 *
 * Three things need it and would otherwise each build it: the renderer, for a prop an
 * instance has no value for; the studio, which renders a symbol against its defaults while
 * it is being *edited*, because a component whose bindings all showed their fallbacks
 * would be a component nobody could see; and `createNodeFor`, through `symbolSpec`.
 */
export function symbolDefaultProps(symbol: SymbolDef): Record<string, Json> {
  return Object.fromEntries(symbol.props.map((prop) => [prop.name, prop.defaultValue]));
}

export function findSymbolProp(symbol: SymbolDef, propId: string): SymbolProp | undefined {
  return symbol.props.find((prop) => prop.id === propId);
}

export function findSymbolPropByName(symbol: SymbolDef, name: string): SymbolProp | undefined {
  return symbol.props.find((prop) => prop.name === name);
}

/**
 * A detached prop with a name that is free as of `symbol` — not added: see
 * {@link addSymbolProp}, and `createStateVar` for why the two steps are separate.
 */
export function createSymbolProp(
  symbol: SymbolDef,
  init: Partial<Omit<SymbolProp, 'id'>> = {},
  newId: () => string = createNodeId,
): SymbolProp {
  const type = init.type ?? 'string';
  const name = uniqueVarName(
    symbol.props.map((prop) => prop.name),
    init.name ?? 'label',
  );

  return {
    id: newId(),
    name,
    // Title-cased, so a component's props are labelled the way the library's are rather
    // than in the identifier case they are *read* by (`props.imageUrl` -> "Image url").
    label: init.label ?? toPropLabel(name),
    type,
    ...(init.options === undefined ? {} : { options: init.options }),
    defaultValue: init.defaultValue ?? defaultSymbolPropValue(type),
  };
}

export function addSymbolProp(
  doc: ProjectDoc,
  symbolId: string,
  prop: SymbolProp,
  index?: number,
): ProjectDoc {
  return updateSymbol(doc, symbolId, (symbol) => {
    if (findSymbolProp(symbol, prop.id)) fail(`prop ${prop.id} is already on this component`);
    if (!isValidVarName(prop.name)) fail(`${prop.name} is not a usable prop name`);
    if (findSymbolPropByName(symbol, prop.name)) fail(`${prop.name} is already in use`);

    const props = [...symbol.props];
    const at = index === undefined ? props.length : Math.max(0, Math.min(index, props.length));
    props.splice(at, 0, prop);
    return { ...symbol, props };
  });
}

/**
 * Rewrites one prop key on every instance of a symbol, across the whole document.
 *
 * This is the half of a rename that a `StateVar` rename deliberately does *not* do. The
 * difference is what is being rewritten: an expression is free-form text, and a
 * search-and-replace over it would happily edit the inside of a string literal, so §10
 * chose ids and a warning instead. An instance's props are a structured record keyed by
 * name, so moving the key is exact — there is no text to misread.
 *
 * Expressions *inside* the symbol that read `props.<old>` are a different matter and are
 * left alone, for exactly the §10 reason. `symbolPropUsage` is what warns about those
 * before the rename lands.
 */
function renameInstanceProp(
  doc: ProjectDoc,
  symbolId: string,
  from: string,
  to: string,
): ProjectDoc {
  const type = symbolType(symbolId);

  const rewrite = <T extends NodeTree>(tree: T): T => {
    let nodes = tree.nodes;
    for (const node of Object.values(tree.nodes)) {
      if (node.type !== type || !(from in node.props)) continue;
      const props = { ...node.props };
      props[to] = props[from]!;
      delete props[from];
      nodes = { ...nodes, [node.id]: { ...node, props } };
    }
    return nodes === tree.nodes ? tree : { ...tree, nodes };
  };

  return { ...doc, pages: doc.pages.map(rewrite), symbols: doc.symbols.map(rewrite) };
}

/**
 * Edits a prop in place, carrying a rename onto every instance.
 *
 * A type change deliberately leaves the stored values alone: they are `Json` either way,
 * the coercions narrow them on the way to the screen (`coerceToProp`), and silently
 * rewriting what an author typed into a field is worse than showing it in a control that
 * reads it differently.
 */
export function updateSymbolProp(
  doc: ProjectDoc,
  symbolId: string,
  propId: string,
  patch: Partial<Omit<SymbolProp, 'id'>>,
): ProjectDoc {
  const symbol = getSymbol(doc, symbolId);
  const index = symbol.props.findIndex((prop) => prop.id === propId);
  if (index === -1) fail(`prop ${propId} is not on this component`);

  const current = symbol.props[index]!;
  const next: SymbolProp = { ...current, ...patch };

  if (!isValidVarName(next.name)) fail(`${next.name} is not a usable prop name`);
  const clash = findSymbolPropByName(symbol, next.name);
  if (clash && clash.id !== propId) fail(`${next.name} is already in use`);

  const props = [...symbol.props];
  props[index] = next;

  const written = updateSymbol(doc, symbolId, (held) => ({ ...held, props }));
  return next.name === current.name
    ? written
    : renameInstanceProp(written, symbolId, current.name, next.name);
}

export function moveSymbolProp(
  doc: ProjectDoc,
  symbolId: string,
  from: number,
  to: number,
): ProjectDoc {
  return updateSymbol(doc, symbolId, (symbol) => {
    if (from < 0 || from >= symbol.props.length) fail(`no prop at index ${from}`);
    const props = [...symbol.props];
    const [moved] = props.splice(from, 1);
    if (moved === undefined) fail(`no prop at index ${from}`);
    props.splice(Math.max(0, Math.min(to, props.length)), 0, moved);
    return { ...symbol, props };
  });
}

/**
 * Removes a prop, and with it the value every instance stored for it.
 *
 * `removeStateVar`'s cascade: a value under a key nothing declares any more is one every
 * reader has to ignore, and it would reappear as a real value if a later prop happened to
 * take the same name.
 */
export function removeSymbolProp(doc: ProjectDoc, symbolId: string, propId: string): ProjectDoc {
  const symbol = getSymbol(doc, symbolId);
  const prop = findSymbolProp(symbol, propId);
  if (!prop) fail(`prop ${propId} is not on this component`);

  const type = symbolType(symbolId);
  const strip = <T extends NodeTree>(tree: T): T => {
    let nodes = tree.nodes;
    for (const node of Object.values(tree.nodes)) {
      if (node.type !== type || !(prop.name in node.props)) continue;
      const props = { ...node.props };
      delete props[prop.name];
      nodes = { ...nodes, [node.id]: { ...node, props } };
    }
    return nodes === tree.nodes ? tree : { ...tree, nodes };
  };

  const written: ProjectDoc = {
    ...doc,
    pages: doc.pages.map(strip),
    symbols: doc.symbols.map(strip),
  };

  return updateSymbol(written, symbolId, (held) => ({
    ...held,
    props: held.props.filter((candidate) => candidate.id !== propId),
  }));
}
