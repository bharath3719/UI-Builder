import { makeNode, makePage, makeSymbol, type Page, type SymbolDef } from '@ui-builder/schema';
import { describe, expect, it } from 'vitest';
import { applyCompletion, completionAt, matchSuggestions, scopeSuggestions } from './scope.js';

function pageWith(): Page {
  return makePage({
    id: 'p1',
    rootId: 'n1',
    nodes: {},
    state: [
      { id: 'sv1', name: 'count', type: 'number', initial: 0 },
      { id: 'sv2', name: 'search', type: 'string', initial: '' },
    ],
    queries: [{ id: 'q1', name: 'users', method: 'GET', url: '/api/users', runOnLoad: true }],
  });
}

function symbolWith(): SymbolDef {
  const root = makeNode({ id: 'r', type: 'Box', name: 'Root' });
  return makeSymbol({
    id: 'sym',
    name: 'Card',
    rootId: 'r',
    nodes: { r: root },
    props: [
      { id: 'p1', name: 'title', label: 'Title', type: 'string', defaultValue: '' },
      { id: 'p2', name: 'featured', label: 'Featured', type: 'boolean', defaultValue: false },
    ],
  });
}

describe('scopeSuggestions', () => {
  it('offers the page’s own variables and queries first', () => {
    const paths = scopeSuggestions(pageWith());

    expect(paths.slice(0, 5)).toEqual([
      'state.count',
      'state.search',
      'queries.users.data',
      'queries.users.loading',
      'queries.users.error',
    ]);
  });

  it('still offers the bare roots, so a page can be explored', () => {
    expect(scopeSuggestions(pageWith())).toContain('state');
    expect(scopeSuggestions(pageWith())).toContain('theme');
  });

  it('withholds the event outside a handler', () => {
    const rendered = scopeSuggestions(pageWith());
    expect(rendered).not.toContain('event');
    expect(rendered.some((path) => path.startsWith('event.'))).toBe(false);
  });

  it('offers the event inside a handler, where it is what binds an input', () => {
    const inHandler = scopeSuggestions(pageWith(), { event: true });
    expect(inHandler).toContain('event.target.value');
    expect(inHandler).toContain('event');
  });

  it('offers item and index only inside a repeat', () => {
    expect(scopeSuggestions(pageWith())).not.toContain('item');
    expect(scopeSuggestions(pageWith(), { item: true })).toContain('item');
    expect(scopeSuggestions(pageWith(), { item: true })).toContain('index');
  });

  it('says each path once', () => {
    const paths = scopeSuggestions(pageWith(), { event: true, item: true });
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('completionAt', () => {
  it('reads the path being typed inside a hole', () => {
    const source = 'Hi {{ state.co';
    expect(completionAt(source, source.length)).toEqual({ token: 'state.co', from: 6, to: 14 });
  });

  it('completes an unclosed hole, which is when it is worth something', () => {
    expect(completionAt('{{ sta', 6)?.token).toBe('sta');
  });

  it('offers everything straight after the braces', () => {
    expect(completionAt('{{ ', 3)).toEqual({ token: '', from: 3, to: 3 });
  });

  it('keeps a trailing dot, so the next segment can be offered', () => {
    expect(completionAt('{{ state.', 9)?.token).toBe('state.');
  });

  it('says nothing outside a hole', () => {
    expect(completionAt('plain text', 10)).toBeNull();
    expect(completionAt('Hello world', 5)).toBeNull();
  });

  it('says nothing once the hole is closed behind the caret', () => {
    const source = '{{ state.count }} and more';
    expect(completionAt(source, source.length)).toBeNull();
  });

  it('completes the second hole while the first is closed', () => {
    const source = '{{ state.count }} of {{ state.to';
    expect(completionAt(source, source.length)?.token).toBe('state.to');
  });

  it('reads at the caret, not at the end of the text', () => {
    // The caret sits after `sta`, with `nding` typed to its right.
    expect(completionAt('{{ standing }}', 6)?.token).toBe('sta');
  });

  it('starts a fresh token after an operator', () => {
    const source = '{{ state.count + ';
    expect(completionAt(source, source.length)?.token).toBe('');
  });
});

describe('matchSuggestions', () => {
  const paths = ['state.count', 'state.search', 'queries.users.data', 'state', 'theme'];

  it('filters by what has been typed', () => {
    expect(matchSuggestions(paths, 'state.')).toEqual(['state.count', 'state.search']);
  });

  it('ignores case', () => {
    expect(matchSuggestions(paths, 'STATE.C')).toEqual(['state.count']);
  });

  it('offers everything for an empty token', () => {
    expect(matchSuggestions(paths, '')).toHaveLength(paths.length);
  });

  it('does not offer back what is already typed in full', () => {
    expect(matchSuggestions(paths, 'state.count')).toEqual([]);
  });

  it('caps the list', () => {
    expect(matchSuggestions(paths, '', 2)).toHaveLength(2);
  });

  it('has nothing for a path that matches none', () => {
    expect(matchSuggestions(paths, 'nope')).toEqual([]);
  });
});

describe('applyCompletion', () => {
  it('replaces the typed path and reports where the caret lands', () => {
    const source = 'Hi {{ state.co';
    const target = completionAt(source, source.length)!;

    expect(applyCompletion(source, target, 'state.count')).toEqual({
      text: 'Hi {{ state.count',
      caret: 17,
    });
  });

  it('keeps what was typed after the caret', () => {
    const source = '{{ sta }}';
    const target = completionAt(source, 6)!;

    expect(applyCompletion(source, target, 'state.count')).toEqual({
      text: '{{ state.count }}',
      caret: 14,
    });
  });

  it('inserts into an empty hole', () => {
    const source = '{{  }}';
    const target = completionAt(source, 3)!;
    expect(applyCompletion(source, target, 'index').text).toBe('{{ index }}');
  });
});

describe('inside a component', () => {
  it('offers its props, and not the page’s data', () => {
    const paths = scopeSuggestions(pageWith(), { symbol: symbolWith() });

    expect(paths.slice(0, 2)).toEqual(['props.title', 'props.featured']);
    expect(paths).toContain('props');
    expect(paths).toContain('theme');
    // A component has no page state or queries by design (§12), so the names would
    // resolve to nothing — offering them would be offering a mistake.
    expect(paths).not.toContain('state');
    expect(paths).not.toContain('queries');
    expect(paths).not.toContain('state.count');
    expect(paths).not.toContain('queries.users.data');
  });

  it('still offers the repeat names, which are the surface’s either way', () => {
    const paths = scopeSuggestions(pageWith(), { symbol: symbolWith(), item: true });

    expect(paths).toContain('item');
    expect(paths).toContain('index');
  });
});

describe('on a page', () => {
  it('does not offer props, which only exist inside a component', () => {
    expect(scopeSuggestions(pageWith())).not.toContain('props');
  });
});
