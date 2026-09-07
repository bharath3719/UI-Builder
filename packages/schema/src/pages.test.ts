import { describe, expect, it } from 'vitest';
import { DOC_SCHEMA_VERSION, makeNode, makePage, type Page, type ProjectDoc } from './doc.js';
import { DocumentError } from './ops.js';
import {
  addPage,
  deletePage,
  duplicatePage,
  getPage,
  movePage,
  normalizePagePath,
  pageIndexOf,
  pagePathAvailable,
  renamePage,
  setPagePath,
  uniquePageName,
  uniquePagePath,
  updatePage,
} from './pages.js';
import { DEFAULT_THEME } from './theme.js';

function page(id: string, name: string, path: string): Page {
  const root = makeNode({ id: `${id}-root`, type: 'Box', name: 'Page', children: [`${id}-a`] });
  const child = makeNode({
    id: `${id}-a`,
    parentId: root.id,
    type: 'Text',
    name: 'Copy',
    styles: { base: { default: { color: 'red' } } },
  });

  return makePage({
    id,
    name,
    path,
    rootId: root.id,
    nodes: { [root.id]: root, [child.id]: child },
  });
}

function doc(...pages: Page[]): ProjectDoc {
  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: 'project',
    name: 'Site',
    pages: pages.length > 0 ? pages : [page('home', 'Home', '/')],
    symbols: [],
    theme: DEFAULT_THEME,
  };
}

describe('normalizePagePath', () => {
  it.each([
    ['about', '/about'],
    ['/about', '/about'],
    ['/about/', '/about'],
    ['//about//team//', '/about/team'],
    ['  /about  ', '/about'],
    ['/users/:id', '/users/:id'],
    ['', '/'],
    ['/', '/'],
    ['   ', '/'],
    ['/our team', '/our-team'],
  ])('%o -> %o', (input, expected) => {
    expect(normalizePagePath(input)).toBe(expected);
  });

  it('leaves case alone, because a :param is part of the path', () => {
    expect(normalizePagePath('/Users/:userId')).toBe('/Users/:userId');
  });
});

describe('uniqueness helpers', () => {
  const base = doc(page('home', 'Home', '/'), page('about', 'About', '/about'));

  it('reports a taken path', () => {
    expect(pagePathAvailable(base, '/about')).toBe(false);
    expect(pagePathAvailable(base, '/about/')).toBe(false);
    expect(pagePathAvailable(base, '/pricing')).toBe(true);
  });

  it('does not count a page against itself', () => {
    expect(pagePathAvailable(base, '/about', 'about')).toBe(true);
  });

  it('suffixes a path until it is free', () => {
    expect(uniquePagePath(base, '/pricing')).toBe('/pricing');
    expect(uniquePagePath(base, '/about')).toBe('/about-2');
    expect(uniquePagePath(base, '/')).toBe('/page');
  });

  it('suffixes a name until it is free', () => {
    expect(uniquePageName(base, 'Contact')).toBe('Contact');
    expect(uniquePageName(base, 'About')).toBe('About 2');
  });
});

describe('addPage', () => {
  it('appends by default and normalizes the path on the way in', () => {
    const next = addPage(doc(), { page: page('about', 'About', 'about/') });

    expect(next.pages.map((entry) => entry.id)).toEqual(['home', 'about']);
    expect(getPage(next, 'about').path).toBe('/about');
  });

  it('inserts at an index, clamping out-of-range', () => {
    const base = doc(page('home', 'Home', '/'), page('about', 'About', '/about'));

    expect(
      addPage(base, { page: page('new', 'New', '/new'), index: 1 }).pages.map((entry) => entry.id),
    ).toEqual(['home', 'new', 'about']);

    expect(
      addPage(base, { page: page('new', 'New', '/new'), index: 99 }).pages.map((entry) => entry.id),
    ).toEqual(['home', 'about', 'new']);
  });

  it('refuses a duplicate id, a taken path, or a page without its root', () => {
    const base = doc(page('home', 'Home', '/'));

    expect(() => addPage(base, { page: page('home', 'Copy', '/copy') })).toThrow(DocumentError);
    expect(() => addPage(base, { page: page('other', 'Other', '/') })).toThrow(/already in use/);
    expect(() =>
      addPage(base, {
        page: makePage({ id: 'x', name: 'X', path: '/x', rootId: 'missing', nodes: {} }),
      }),
    ).toThrow(/root node/);
  });

  it('shares the pages it did not touch', () => {
    const base = doc();
    const next = addPage(base, { page: page('about', 'About', '/about') });
    expect(next.pages[0]).toBe(base.pages[0]);
  });
});

describe('deletePage', () => {
  it('removes one page', () => {
    const base = doc(page('home', 'Home', '/'), page('about', 'About', '/about'));
    expect(deletePage(base, 'about').pages.map((entry) => entry.id)).toEqual(['home']);
  });

  it('keeps the last page, because the schema requires one', () => {
    expect(() => deletePage(doc(), 'home')).toThrow(/at least one page/);
  });

  it('throws for an unknown id', () => {
    expect(() => deletePage(doc(), 'nope')).toThrow(DocumentError);
  });
});

describe('renamePage / setPagePath', () => {
  const base = doc(page('home', 'Home', '/'), page('about', 'About', '/about'));

  it('renames', () => {
    expect(getPage(renamePage(base, 'about', 'Our team'), 'about').name).toBe('Our team');
  });

  it('returns the same document when nothing changes', () => {
    expect(renamePage(base, 'about', 'About')).toBe(base);
    expect(setPagePath(base, 'about', '/about/')).toBe(base);
  });

  it('normalizes a new path', () => {
    expect(getPage(setPagePath(base, 'about', 'team/'), 'about').path).toBe('/team');
  });

  it('refuses a path another page holds', () => {
    expect(() => setPagePath(base, 'about', '/')).toThrow(/already in use/);
  });

  it('allows a page to keep its own path', () => {
    expect(() => setPagePath(base, 'about', '/about')).not.toThrow();
  });
});

describe('movePage', () => {
  const base = doc(
    page('home', 'Home', '/'),
    page('about', 'About', '/about'),
    page('pricing', 'Pricing', '/pricing'),
  );

  it('reorders', () => {
    expect(movePage(base, 2, 0).pages.map((entry) => entry.id)).toEqual([
      'pricing',
      'home',
      'about',
    ]);
  });

  it('clamps the destination', () => {
    expect(movePage(base, 0, 99).pages.map((entry) => entry.id)).toEqual([
      'about',
      'pricing',
      'home',
    ]);
  });

  it('throws for a source out of range', () => {
    expect(() => movePage(base, 3, 0)).toThrow(DocumentError);
  });
});

describe('updatePage', () => {
  it('applies a page transform in place', () => {
    const base = doc(page('home', 'Home', '/'), page('about', 'About', '/about'));
    const next = updatePage(base, 'about', (entry) => ({ ...entry, name: 'Changed' }));

    expect(getPage(next, 'about').name).toBe('Changed');
    expect(next.pages[0]).toBe(base.pages[0]);
  });

  it('throws for an unknown page', () => {
    expect(() => updatePage(doc(), 'nope', (entry) => entry)).toThrow(DocumentError);
  });
});

describe('duplicatePage', () => {
  const base = doc(page('home', 'Home', '/'), page('about', 'About', '/about'));

  let counter = 0;
  const ids = () => `n${(counter += 1)}`;

  it('inserts the copy directly after the original with a free name and path', () => {
    counter = 0;
    const next = duplicatePage(base, 'about', ids);

    expect(next.pages.map((entry) => entry.id)).toEqual(['home', 'about', 'n3']);
    expect(getPage(next, 'n3').name).toBe('About 2');
    expect(getPage(next, 'n3').path).toBe('/about-2');
  });

  it('gives every node a fresh id and keeps the tree wired to them', () => {
    counter = 0;
    const copy = getPage(duplicatePage(base, 'about', ids), 'n3');
    const source = getPage(base, 'about');

    const copiedIds = Object.keys(copy.nodes);
    expect(copiedIds).toHaveLength(Object.keys(source.nodes).length);
    for (const id of copiedIds) expect(source.nodes[id]).toBeUndefined();

    const root = copy.nodes[copy.rootId];
    expect(root).toBeDefined();
    expect(root!.parentId).toBeNull();
    // Every child id resolves inside the copy, and points back at its own parent.
    for (const childId of root!.children) {
      expect(copy.nodes[childId]?.parentId).toBe(copy.rootId);
    }
  });

  it('deep-copies styles rather than aliasing the original', () => {
    counter = 0;
    const next = duplicatePage(base, 'about', ids);
    const copy = getPage(next, 'n3');
    const copiedChild = copy.nodes[copy.nodes[copy.rootId]!.children[0]!]!;

    expect(copiedChild.styles).toEqual({ base: { default: { color: 'red' } } });
    expect(copiedChild.styles).not.toBe(getPage(base, 'about').nodes['about-a']!.styles);
  });

  it('throws for an unknown page', () => {
    expect(() => duplicatePage(base, 'nope')).toThrow(DocumentError);
  });
});

describe('pageIndexOf', () => {
  it('is -1 for a page that is not there', () => {
    expect(pageIndexOf(doc(), 'nope')).toBe(-1);
    expect(pageIndexOf(doc(), 'home')).toBe(0);
  });
});
