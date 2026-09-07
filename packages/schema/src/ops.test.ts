import { describe, expect, it } from 'vitest';
import { makeNode, makePage, staticProp, type Node, type Page } from './doc.js';
import { exprProp } from './expr.js';
import {
  DocumentError,
  addQuery,
  addStateVar,
  canMoveInto,
  createQuery,
  createStateVar,
  deleteNode,
  descendantIds,
  duplicateNode,
  findStateVar,
  insertNode,
  isDescendant,
  isLocked,
  moveNode,
  moveNodes,
  nodePath,
  removeQuery,
  removeStateVar,
  reorder,
  setNodeEvent,
  setNodeFlags,
  setNodeRepeat,
  setNodeShowIf,
  setNodeStyles,
  topmostNodes,
  updateQuery,
  updateStateVar,
} from './ops.js';

/**
 * root
 *  ├─ a
 *  │   ├─ a1
 *  │   └─ a2
 *  ├─ b
 *  └─ c
 */
function fixture(): Page {
  const nodes: Node[] = [
    makeNode({ id: 'root', type: 'Box', name: 'Page', children: ['a', 'b', 'c'] }),
    makeNode({ id: 'a', parentId: 'root', type: 'VStack', name: 'A', children: ['a1', 'a2'] }),
    makeNode({ id: 'a1', parentId: 'a', type: 'Text', name: 'A1' }),
    makeNode({ id: 'a2', parentId: 'a', type: 'Text', name: 'A2' }),
    makeNode({ id: 'b', parentId: 'root', type: 'Box', name: 'B' }),
    makeNode({ id: 'c', parentId: 'root', type: 'Box', name: 'C' }),
  ];

  return makePage({
    id: 'page',
    name: 'Home',
    path: '/',
    rootId: 'root',
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
  });
}

const childrenOf = (page: Page, id: string) => page.nodes[id]?.children;

describe('traversal', () => {
  it('walks root to node', () => {
    expect(nodePath(fixture(), 'a2').map((node) => node.id)).toEqual(['root', 'a', 'a2']);
  });

  it('collects descendants without the node itself', () => {
    expect(descendantIds(fixture(), 'a').sort()).toEqual(['a1', 'a2']);
    expect(descendantIds(fixture(), 'a1')).toEqual([]);
  });

  it('recognises indirect ancestry', () => {
    const page = fixture();
    expect(isDescendant(page, 'root', 'a2')).toBe(true);
    expect(isDescendant(page, 'a', 'a2')).toBe(true);
    expect(isDescendant(page, 'b', 'a2')).toBe(false);
    expect(isDescendant(page, 'a2', 'a2')).toBe(false);
  });
});

describe('topmostNodes', () => {
  it('returns a flat selection in document order, however it was clicked', () => {
    expect(topmostNodes(fixture(), ['c', 'a1', 'b'])).toEqual(['a1', 'b', 'c']);
  });

  it('drops a node whose ancestor is also selected', () => {
    // The case every whole-selection command depends on: deleting `a` takes `a1` with
    // it, so acting on both would delete a node that is already gone.
    expect(topmostNodes(fixture(), ['a', 'a1'])).toEqual(['a']);
    expect(topmostNodes(fixture(), ['a1', 'a', 'a2'])).toEqual(['a']);
  });

  it('keeps siblings under a parent that is not selected', () => {
    expect(topmostNodes(fixture(), ['a1', 'a2'])).toEqual(['a1', 'a2']);
  });

  it('swallows everything when the root is in the set', () => {
    expect(topmostNodes(fixture(), ['b', 'root', 'a1'])).toEqual(['root']);
  });

  it('ignores ids the page no longer has, rather than throwing', () => {
    // A selection is studio state and survives the undo that removed what it named.
    expect(topmostNodes(fixture(), ['gone', 'b'])).toEqual(['b']);
    expect(topmostNodes(fixture(), [])).toEqual([]);
    expect(topmostNodes(fixture(), ['gone'])).toEqual([]);
  });

  it('deduplicates', () => {
    expect(topmostNodes(fixture(), ['b', 'b'])).toEqual(['b']);
  });
});

describe('moveNodes', () => {
  it('lands a selection contiguously and in document order', () => {
    const page = moveNodes(fixture(), ['c', 'b'], 'a', 1);
    expect(childrenOf(page, 'a')).toEqual(['a1', 'b', 'c', 'a2']);
    expect(childrenOf(page, 'root')).toEqual(['a']);
  });

  it('keeps the order when reordering inside one parent, from either side', () => {
    // `a` starts above `c`; both end up after `c`'s old position, still a before c.
    const down = moveNodes(fixture(), ['a', 'c'], 'root', 3);
    expect(childrenOf(down, 'root')).toEqual(['b', 'a', 'c']);

    const up = moveNodes(fixture(), ['b', 'c'], 'root', 0);
    expect(childrenOf(up, 'root')).toEqual(['b', 'c', 'a']);
  });

  it('moves the ancestor only when a parent and its child are both selected', () => {
    const page = moveNodes(fixture(), ['a', 'a1'], 'b');
    expect(childrenOf(page, 'b')).toEqual(['a']);
    expect(childrenOf(page, 'a')).toEqual(['a1', 'a2']);
  });

  it('skips what cannot move and still moves the rest', () => {
    // `a` cannot go inside `a1`, which is its own child; `b` has no such problem.
    const page = moveNodes(fixture(), ['a', 'b'], 'a1');
    expect(childrenOf(page, 'a1')).toEqual(['b']);
    expect(childrenOf(page, 'root')).toEqual(['a', 'c']);
  });

  it('ignores the root and ids the page does not have', () => {
    const page = moveNodes(fixture(), ['root', 'gone'], 'b');
    expect(childrenOf(page, 'b')).toEqual([]);
    expect(childrenOf(page, 'root')).toEqual(['a', 'b', 'c']);
  });
});

describe('insertNode', () => {
  it('appends when no index is given and sets the parent link', () => {
    const page = insertNode(fixture(), {
      node: makeNode({ id: 'd', type: 'Box', name: 'D' }),
      parentId: 'root',
    });
    expect(childrenOf(page, 'root')).toEqual(['a', 'b', 'c', 'd']);
    expect(page.nodes.d?.parentId).toBe('root');
  });

  it('inserts at an index and clamps one past the end', () => {
    const at1 = insertNode(fixture(), {
      node: makeNode({ id: 'd', type: 'Box', name: 'D' }),
      parentId: 'root',
      index: 1,
    });
    expect(childrenOf(at1, 'root')).toEqual(['a', 'd', 'b', 'c']);

    const beyond = insertNode(fixture(), {
      node: makeNode({ id: 'd', type: 'Box', name: 'D' }),
      parentId: 'root',
      index: 99,
    });
    expect(childrenOf(beyond, 'root')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves the input page untouched', () => {
    const page = fixture();
    insertNode(page, { node: makeNode({ id: 'd', type: 'Box', name: 'D' }), parentId: 'root' });
    expect(childrenOf(page, 'root')).toEqual(['a', 'b', 'c']);
    expect(page.nodes.d).toBeUndefined();
  });

  it('shares the nodes it did not touch', () => {
    const before = fixture();
    const after = insertNode(before, {
      node: makeNode({ id: 'd', type: 'Box', name: 'D' }),
      parentId: 'a',
    });
    expect(after.nodes.b).toBe(before.nodes.b);
    expect(after.nodes.a).not.toBe(before.nodes.a);
  });

  it('rejects an id already in the page', () => {
    expect(() =>
      insertNode(fixture(), { node: makeNode({ id: 'b', type: 'Box', name: 'B' }), parentId: 'a' }),
    ).toThrow(DocumentError);
  });
});

describe('moveNode', () => {
  it('moves between parents', () => {
    const page = moveNode(fixture(), { nodeId: 'a1', newParentId: 'b', index: 0 });
    expect(childrenOf(page, 'a')).toEqual(['a2']);
    expect(childrenOf(page, 'b')).toEqual(['a1']);
    expect(page.nodes.a1?.parentId).toBe('b');
  });

  // The index a drop resolver computes counts the dragged node itself, because it is
  // still in the list the indicator was drawn over. Getting this wrong is the classic
  // "drops one slot short when moving right" bug.
  it('compensates for its own removal when moving forward within a parent', () => {
    const page = moveNode(fixture(), { nodeId: 'a', newParentId: 'root', index: 3 });
    expect(childrenOf(page, 'root')).toEqual(['b', 'c', 'a']);
  });

  it('does not compensate when moving backward within a parent', () => {
    const page = moveNode(fixture(), { nodeId: 'c', newParentId: 'root', index: 0 });
    expect(childrenOf(page, 'root')).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op when dropped back where it started', () => {
    const page = moveNode(fixture(), { nodeId: 'b', newParentId: 'root', index: 1 });
    expect(childrenOf(page, 'root')).toEqual(['a', 'b', 'c']);
  });

  it('refuses to move a node into its own subtree', () => {
    const page = fixture();
    expect(canMoveInto(page, 'a', 'a2')).toBe(false);
    expect(canMoveInto(page, 'a', 'a')).toBe(false);
    expect(canMoveInto(page, 'a', 'b')).toBe(true);
    expect(() => moveNode(page, { nodeId: 'a', newParentId: 'a2' })).toThrow(DocumentError);
  });

  it('refuses to move the root', () => {
    expect(() => moveNode(fixture(), { nodeId: 'root', newParentId: 'a' })).toThrow(DocumentError);
  });
});

describe('deleteNode', () => {
  it('cascades to descendants and unlinks from the parent', () => {
    const page = deleteNode(fixture(), 'a');
    expect(childrenOf(page, 'root')).toEqual(['b', 'c']);
    expect(page.nodes.a).toBeUndefined();
    expect(page.nodes.a1).toBeUndefined();
    expect(page.nodes.a2).toBeUndefined();
  });

  it('refuses to delete the root', () => {
    expect(() => deleteNode(fixture(), 'root')).toThrow(DocumentError);
  });
});

describe('reorder', () => {
  it('moves a child to a new index', () => {
    expect(childrenOf(reorder(fixture(), 'root', 0, 2), 'root')).toEqual(['b', 'c', 'a']);
    expect(childrenOf(reorder(fixture(), 'root', 2, 0), 'root')).toEqual(['c', 'a', 'b']);
  });

  it('rejects an index that is not a child', () => {
    expect(() => reorder(fixture(), 'root', 9, 0)).toThrow(DocumentError);
  });
});

describe('duplicateNode', () => {
  it('deep-copies with fresh ids, directly after the original', () => {
    let n = 0;
    const page = duplicateNode(fixture(), 'a', () => `copy${++n}`);

    expect(childrenOf(page, 'root')).toEqual(['a', 'copy1', 'b', 'c']);
    expect(page.nodes.copy1?.children).toEqual(['copy2', 'copy3']);
    expect(page.nodes.copy2?.parentId).toBe('copy1');
    // The original keeps its own children — the copy must not steal them.
    expect(page.nodes.a?.children).toEqual(['a1', 'a2']);
  });

  it('copies styles rather than sharing them', () => {
    const withStyle = setNodeStyles(fixture(), 'a', { decls: { padding: 8 } });
    const page = duplicateNode(
      withStyle,
      'a',
      (() => {
        let n = 0;
        return () => `copy${++n}`;
      })(),
    );

    expect(page.nodes.copy1?.styles.base?.default).toEqual({ padding: 8 });
    expect(page.nodes.copy1?.styles).not.toBe(page.nodes.a?.styles);
  });

  it('refuses to duplicate the root', () => {
    expect(() => duplicateNode(fixture(), 'root')).toThrow(DocumentError);
  });
});

describe('setNodeStyles', () => {
  it('merges into the base/default bucket by default', () => {
    let page = setNodeStyles(fixture(), 'b', { decls: { padding: 8 } });
    page = setNodeStyles(page, 'b', { decls: { color: 'red' } });
    expect(page.nodes.b?.styles.base?.default).toEqual({ padding: 8, color: 'red' });
  });

  it('clears a declaration set to undefined', () => {
    let page = setNodeStyles(fixture(), 'b', { decls: { padding: 8, color: 'red' } });
    page = setNodeStyles(page, 'b', { decls: { padding: undefined } });
    expect(page.nodes.b?.styles.base?.default).toEqual({ color: 'red' });
  });

  it('keeps breakpoints and states in separate buckets', () => {
    let page = setNodeStyles(fixture(), 'b', { decls: { padding: 8 } });
    page = setNodeStyles(page, 'b', { breakpoint: 'md', decls: { padding: 16 } });
    page = setNodeStyles(page, 'b', { state: 'hover', decls: { padding: 12 } });

    expect(page.nodes.b?.styles.base?.default).toEqual({ padding: 8 });
    expect(page.nodes.b?.styles.base?.hover).toEqual({ padding: 12 });
    expect(page.nodes.b?.styles.md?.default).toEqual({ padding: 16 });
  });
});

describe('setNodeFlags', () => {
  it('sets only the flags it is given', () => {
    const page = setNodeFlags(fixture(), 'b', { hidden: true });
    expect(page.nodes.b?.hidden).toBe(true);
    expect(page.nodes.b?.locked).toBeUndefined();
  });

  it('removes the key rather than storing false', () => {
    let page = setNodeFlags(fixture(), 'b', { hidden: true, locked: true });
    page = setNodeFlags(page, 'b', { hidden: false });

    expect('hidden' in (page.nodes.b ?? {})).toBe(false);
    expect(page.nodes.b?.locked).toBe(true);
  });

  it('leaves a node that was never flagged identical to a flagged-then-cleared one', () => {
    let page = setNodeFlags(fixture(), 'b', { locked: true });
    page = setNodeFlags(page, 'b', { locked: false });
    expect(page.nodes.b).toEqual(fixture().nodes.b);
  });

  it('rejects an unknown node', () => {
    expect(() => setNodeFlags(fixture(), 'nope', { hidden: true })).toThrow(DocumentError);
  });
});

describe('isLocked', () => {
  it('reports a node locked by its own flag', () => {
    expect(isLocked(setNodeFlags(fixture(), 'a1', { locked: true }), 'a1')).toBe(true);
  });

  it('reports a node locked by an ancestor', () => {
    const page = setNodeFlags(fixture(), 'a', { locked: true });
    expect(isLocked(page, 'a1')).toBe(true);
    expect(isLocked(page, 'a2')).toBe(true);
    expect(isLocked(page, 'b')).toBe(false);
  });

  it('is false for an unlocked tree and for an unknown node', () => {
    expect(isLocked(fixture(), 'a1')).toBe(false);
    expect(isLocked(fixture(), 'nope')).toBe(false);
  });
});

describe('setNodeEvent', () => {
  const step = { kind: 'toggleState', stateId: 's1' } as const;

  it('writes a handler', () => {
    expect(setNodeEvent(fixture(), 'b', 'onClick', [step]).nodes.b?.events).toEqual({
      onClick: [step],
    });
  });

  it('leaves a node whose last step was removed identical to one that never had a handler', () => {
    // `setNodeFlags`' rule: otherwise undo, the dirty check and the revision diff all see
    // a change that is not one.
    let page = setNodeEvent(fixture(), 'b', 'onClick', [step]);
    page = setNodeEvent(page, 'b', 'onClick', []);

    expect(page.nodes.b).toEqual(fixture().nodes.b);
    expect(setNodeEvent(page, 'b', 'onClick', undefined).nodes.b).toEqual(fixture().nodes.b);
  });
});

describe('setNodeRepeat and setNodeShowIf', () => {
  it('sets and clears without leaving the key behind', () => {
    const repeat = { over: exprProp('{{ queries.users.data }}') };

    const set = setNodeRepeat(fixture(), 'b', repeat);
    expect(set.nodes.b?.repeat).toEqual(repeat);
    expect(setNodeRepeat(set, 'b', undefined).nodes.b).toEqual(fixture().nodes.b);

    const shown = setNodeShowIf(fixture(), 'b', exprProp('{{ state.open }}'));
    expect(shown.nodes.b?.showIf).toEqual(exprProp('{{ state.open }}'));
    expect(setNodeShowIf(shown, 'b', undefined).nodes.b).toEqual(fixture().nodes.b);
  });

  it('refuses to repeat the root, which is the page itself', () => {
    expect(() => setNodeRepeat(fixture(), 'root', { over: exprProp('{{ x }}') })).toThrow(
      /root node/,
    );
  });
});

describe('state variables', () => {
  it('creates one with a free name and a value matching its type', () => {
    const page = fixture();
    const first = createStateVar(page, { name: 'count', type: 'number' });

    expect(first).toMatchObject({ name: 'count', type: 'number', initial: 0 });
    expect(createStateVar(addStateVar(page, first), { name: 'count' }).name).toBe('count2');
  });

  it('adds, updates and finds', () => {
    const variable = createStateVar(fixture(), { name: 'count', type: 'number', initial: 2 });
    const page = addStateVar(fixture(), variable);

    expect(page.state).toHaveLength(1);
    expect(findStateVar(page, variable.id)?.initial).toBe(2);
    expect(updateStateVar(page, variable.id, { initial: 9 }).state[0]?.initial).toBe(9);
    expect(updateStateVar(page, variable.id, { name: 'total' }).state[0]?.name).toBe('total');
  });

  it('refuses a name that is not an identifier, or one already in use', () => {
    const page = addStateVar(fixture(), createStateVar(fixture(), { name: 'count' }));
    const other = createStateVar(page, { name: 'other' });

    expect(() => addStateVar(page, { ...other, name: 'user name' })).toThrow(/usable/);
    expect(() => addStateVar(page, { ...other, name: 'count' })).toThrow(/already in use/);
    expect(() => updateStateVar(page, page.state[0]!.id, { name: '2bad' })).toThrow(/usable/);
  });

  it('renaming to its own name is not a collision with itself', () => {
    const page = addStateVar(fixture(), createStateVar(fixture(), { name: 'count' }));
    const id = page.state[0]!.id;

    expect(() => updateStateVar(page, id, { name: 'count', initial: 1 })).not.toThrow();
  });

  it('removing one takes the action steps that targeted it, and leaves the rest', () => {
    const variable = createStateVar(fixture(), { name: 'count' });
    const other = { id: 'q1', kind: 'runQuery' } as const;

    let page = addStateVar(fixture(), variable);
    page = setNodeEvent(page, 'b', 'onClick', [
      { kind: 'setState', stateId: variable.id, value: staticProp(1) },
      { kind: 'runQuery', queryId: other.id },
    ]);
    page = setNodeEvent(page, 'c', 'onClick', [{ kind: 'toggleState', stateId: variable.id }]);

    const after = removeStateVar(page, variable.id);

    expect(after.state).toEqual([]);
    expect(after.nodes.b?.events).toEqual({ onClick: [{ kind: 'runQuery', queryId: 'q1' }] });
    // The handler whose every step went should be gone, not left as an empty array.
    expect(after.nodes.c?.events).toEqual({});
  });

  it('leaves the nodes it did not have to touch identical', () => {
    const variable = createStateVar(fixture(), { name: 'count' });
    const page = addStateVar(fixture(), variable);

    expect(removeStateVar(page, variable.id).nodes).toBe(page.nodes);
  });

  it('rejects an unknown id', () => {
    expect(() => removeStateVar(fixture(), 'nope')).toThrow(DocumentError);
    expect(() => updateStateVar(fixture(), 'nope', { name: 'x' })).toThrow(DocumentError);
  });
});

describe('queries', () => {
  it('creates, adds and updates one', () => {
    const query = createQuery(fixture(), { name: 'users', url: '/api/users' });
    const page = addQuery(fixture(), query);

    expect(query).toMatchObject({ method: 'GET', runOnLoad: true });
    expect(page.queries).toHaveLength(1);
    expect(updateQuery(page, query.id, { method: 'POST' }).queries[0]?.method).toBe('POST');
    expect(() => addQuery(page, { ...createQuery(page), name: 'users' })).toThrow(/already in use/);
  });

  it('omits the optional fields rather than storing them undefined', () => {
    // A query that never had a body must compare equal to one whose body was cleared.
    expect('body' in createQuery(fixture())).toBe(false);
    expect('headers' in createQuery(fixture())).toBe(false);
  });

  it('removing one takes the runQuery steps that pointed at it', () => {
    const query = createQuery(fixture(), { name: 'users' });
    let page = addQuery(fixture(), query);
    page = setNodeEvent(page, 'b', 'onClick', [
      { kind: 'runQuery', queryId: query.id },
      { kind: 'toggleState', stateId: 's1' },
    ]);

    const after = removeQuery(page, query.id);

    expect(after.queries).toEqual([]);
    expect(after.nodes.b?.events).toEqual({
      onClick: [{ kind: 'toggleState', stateId: 's1' }],
    });
  });
});
