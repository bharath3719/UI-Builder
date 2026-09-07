import { describe, expect, it } from 'vitest';
import { readProp } from '@ui-builder/schema';
import {
  SPECS,
  acceptsChildren,
  createNodeFor,
  createPage,
  getSpec,
  searchSpecs,
  specsByCategory,
} from './registry.js';

describe('the registry', () => {
  it('has a unique key per component', () => {
    expect(new Set(SPECS.map((spec) => spec.key)).size).toBe(SPECS.length);
  });

  it('finds every spec by its key', () => {
    for (const spec of SPECS) expect(getSpec(spec.key)).toBe(spec);
    expect(getSpec('NotAComponent')).toBeUndefined();
  });

  it('never lets a void component accept children', () => {
    for (const spec of SPECS) {
      if (spec.isVoid) expect(spec.acceptsChildren, spec.key).toBe(false);
    }
  });

  it('gives every enum prop a default that is one of its own options', () => {
    // A default outside the option list shows as an empty select the moment the
    // inspector renders it.
    for (const spec of SPECS) {
      for (const prop of spec.props) {
        if (prop.type !== 'enum') continue;
        const value = spec.defaultProps[prop.name];
        if (value === undefined) continue;
        expect(
          prop.options.map((option) => option.value),
          `${spec.key}.${prop.name}`,
        ).toContain(value);
      }
    }
  });

  it('groups by category in a fixed order, skipping empty ones', () => {
    const groups = specsByCategory();
    expect(groups.map((group) => group.category)).toEqual([
      'Layout',
      'Basic',
      'Form',
      'Data',
      'Media',
      'AI',
    ]);
    expect(groups.every((group) => group.specs.length > 0)).toBe(true);
    expect(groups.flatMap((group) => group.specs)).toHaveLength(SPECS.length);
  });
});

describe('searchSpecs', () => {
  it('returns everything for an empty query', () => {
    expect(searchSpecs('')).toHaveLength(SPECS.length);
    expect(searchSpecs('   ')).toHaveLength(SPECS.length);
  });

  // The example from PLAN.md §7: someone who wants a column does not know we call it
  // a Vertical Stack, so the keyword has to carry the match.
  it('surfaces Vertical Stack for "col"', () => {
    expect(searchSpecs('col')[0]?.key).toBe('VStack');
  });

  it('ranks an exact name above a keyword match', () => {
    expect(searchSpecs('box')[0]?.key).toBe('Box');
    expect(searchSpecs('button')[0]?.key).toBe('Button');
  });

  it('is case-insensitive', () => {
    expect(searchSpecs('BUTTON')[0]?.key).toBe('Button');
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(searchSpecs('zzzz')).toEqual([]);
  });
});

describe('createNodeFor', () => {
  it('bakes the spec defaults into the node', () => {
    const spec = getSpec('Button');
    expect(spec).toBeDefined();
    const node = createNodeFor(spec!);

    expect(node.type).toBe('Button');
    expect(node.name).toBe('Button');
    expect(readProp(node, 'variant')).toBe('default');
    expect(node.children).toEqual([]);
  });

  it('copies default styles rather than sharing the spec object', () => {
    const spec = getSpec('VStack')!;
    const a = createNodeFor(spec);
    const b = createNodeFor(spec);

    expect(a.id).not.toBe(b.id);
    expect(a.styles.base?.default).toEqual(spec.defaultStyles);
    expect(a.styles.base?.default).not.toBe(spec.defaultStyles);
  });

  it('leaves styles empty when the spec has no defaults', () => {
    expect(createNodeFor(getSpec('Text')!).styles).toEqual({});
  });
});

describe('createPage', () => {
  it('is one empty root that accepts children', () => {
    const page = createPage();
    const root = page.nodes[page.rootId];

    expect(root).toBeDefined();
    expect(root!.parentId).toBeNull();
    expect(root!.children).toEqual([]);
    expect(acceptsChildren(root!.type)).toBe(true);
    expect(Object.keys(page.nodes)).toHaveLength(1);
  });

  it('gives each page fresh ids', () => {
    expect(createPage().rootId).not.toBe(createPage().rootId);
  });
});
