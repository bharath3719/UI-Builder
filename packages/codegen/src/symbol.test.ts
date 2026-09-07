/**
 * Reusable user components, generated — PLAN.md §12.
 *
 * A generator has three ways to be wrong and this file covers the first: the snapshot says
 * what a symbol *becomes*, so a diff here is a change to what every user's exported
 * component looks like. The second is that it compiles, which is `scripts/build-export`
 * running `tsc` inside the emitted project; the third is that it works, which is the
 * browser pass driving the built export.
 */

import { makeNode, makePage, makeSymbol, symbolType, type ProjectDoc } from '@ui-builder/schema';
import { describe, expect, test } from 'vitest';
import { DEFAULT_THEME } from '@ui-builder/schema';
import { demoDoc, symbolDoc } from './fixtures.js';
import { generateProject, type VirtualFile } from './project.js';

function fileAt(files: VirtualFile[], path: string): string {
  const file = files.find((each) => each.path === path);
  if (!file) throw new Error(`no ${path} in [${files.map((each) => each.path).join(', ')}]`);
  return file.contents;
}

describe('a document with components', () => {
  test('writes one file per symbol, beside the behaviour modules', () => {
    const { files } = generateProject(symbolDoc());

    expect(files.map((file) => file.path)).toEqual([
      'package.json',
      'index.html',
      'vite.config.ts',
      'tsconfig.json',
      '.gitignore',
      'README.md',
      'src/vite-env.d.ts',
      'src/main.tsx',
      'src/App.tsx',
      'src/theme.css',
      'src/library.css',
      'src/pages/Home.tsx',
      'src/pages/Home.module.css',
      'src/components/StatusBadge.tsx',
      'src/components/ProductCard.tsx',
      'src/components/ProductCard.module.css',
      'src/lib/query.ts',
      'src/lib/values.ts',
    ]);
    // A symbol whose nodes carry no rules gets no stylesheet, the same as a page.
    expect(files.some((file) => file.path === 'src/components/StatusBadge.module.css')).toBe(false);
  });

  test('a document with no symbols is unchanged', () => {
    // The proof that this phase is additive: `demoDoc` predates symbols entirely and its
    // own snapshot is asserted elsewhere. What matters here is that nothing new appeared.
    const { files } = generateProject(demoDoc());

    expect(files.filter((file) => file.path.startsWith('src/components/'))).toEqual([
      { path: 'src/components/SortableRows.tsx', contents: expect.any(String) },
    ]);
  });

  test('the component someone reads', () => {
    expect(
      fileAt(generateProject(symbolDoc()).files, 'src/components/ProductCard.tsx'),
    ).toMatchSnapshot();
  });

  test('a component that places another component', () => {
    expect(
      fileAt(generateProject(symbolDoc()).files, 'src/components/StatusBadge.tsx'),
    ).toMatchSnapshot();
  });

  test('the page that places them', () => {
    expect(fileAt(generateProject(symbolDoc()).files, 'src/pages/Home.tsx')).toMatchSnapshot();
  });

  test('an instance with its own styles gets a rule, and hands the class to the component', () => {
    const { files } = generateProject(symbolDoc());
    const page = fileAt(files, 'src/pages/Home.tsx');
    const component = fileAt(files, 'src/components/ProductCard.tsx');

    // The placement passes its class in…
    expect(page).toContain("<ProductCard\n        className={styles['ub-n-one']}");
    // …and the component wears it on the element its own root renders, last, so an
    // override beats the component's own rule on source order. No wrapper element: a box
    // in the middle of someone's layout would change how the export lays out (D6).
    expect(component).toContain("cx('ub-card', styles['ub-n-card-root'], className)");
    expect(fileAt(files, 'src/pages/Home.module.css')).toContain('.ub-n-one');
  });

  test('an instance that stores nothing leans on the component’s own defaults', () => {
    const page = fileAt(generateProject(symbolDoc()).files, 'src/pages/Home.tsx');

    // Not `<ProductCard title="Untitled" price={0} … />`: the default is written once, in
    // the component's parameters, which is where the runtime applies it too.
    expect(page).toContain('<ProductCard />');
  });

  test('a bound prop is resolved where the instance sits, not inside the component', () => {
    const page = fileAt(generateProject(symbolDoc()).files, 'src/pages/Home.tsx');

    // `item` and `state` are the *page's* names, and they only exist here. That is the
    // whole point of a component taking props rather than reading the page.
    expect(page).toContain("title={text(item.name, 'Untitled')}");
    expect(page).toContain('price={num(item.price, 0, { round: false })}');
    expect(page).toContain('featured={truthy(state.all)}');
  });

  test('nothing rewrites the expressions inside a component', () => {
    const component = fileAt(generateProject(symbolDoc()).files, 'src/components/ProductCard.tsx');

    // `{{ props.title }}` on the canvas is `props.title` here — which is why the component
    // declares `props` as an object rather than relying on the destructured names.
    expect(component).toContain('const props = { title, price, featured, status };');
    expect(component).toContain("text(props.title, 'Heading')");
  });

  test('says so rather than emitting nothing when a component is gone', () => {
    const doc = symbolDoc();
    doc.symbols = doc.symbols.filter((symbol) => symbol.id !== 'sym-card');

    const { warnings } = generateProject(doc);

    expect(warnings).toContain(
      'Skipped "Featured" (one): no component in this project with id "sym-card".',
    );
  });

  test('names two components that share a label apart, without colliding with a page', () => {
    const doc = symbolDoc();
    doc.symbols[0]!.name = 'Product card';
    // A page called the same thing is not a collision: they land in different folders.
    doc.pages[0]!.name = 'Product card';

    const paths = generateProject(doc).files.map((file) => file.path);

    expect(paths).toContain('src/components/ProductCard.tsx');
    expect(paths).toContain('src/components/ProductCard2.tsx');
    expect(paths).toContain('src/pages/ProductCard.tsx');
  });
});

describe('a repeated node with no handlers', () => {
  test('closes both of the parens it opened', () => {
    // A `.map()` whose callback has no statements is written as an arrow with a
    // parenthesised body, so the call and the body both have to close. Every earlier
    // fixture's repeat happened to declare a handler and take the other branch, so this
    // shipped an export that would not compile until a symbol fixture hit it.
    const page = fileAt(generateProject(symbolDoc()).files, 'src/pages/Home.tsx');

    expect(page).toContain('))}');
    expect(page).not.toMatch(/^\s*\)}\s*$/m);
  });
});

describe('a component with nothing to render', () => {
  test('still takes the props its callers pass, named out of the way', () => {
    // `noUnusedParameters` in the generated project would reject a parameter nobody reads,
    // and a page placing the component still passes props to it.
    const root = makeNode({
      id: 'r',
      type: 'Box',
      name: 'Root',
      showIf: { kind: 'static', value: false },
    });
    const instance = makeNode({ id: 'i', type: symbolType('s'), name: 'Empty', parentId: 'p' });
    const page = makeNode({ id: 'p', type: 'Box', name: 'Page', children: ['i'] });

    const doc: ProjectDoc = {
      schemaVersion: 3,
      id: 'd',
      name: 'D',
      pages: [makePage({ id: 'pg', rootId: 'p', nodes: { p: page, i: instance } })],
      symbols: [makeSymbol({ id: 's', name: 'Empty', rootId: 'r', nodes: { r: root } })],
      theme: DEFAULT_THEME,
    };

    const component = fileAt(generateProject(doc).files, 'src/components/Empty.tsx');

    expect(component).toContain('export function Empty(_props: EmptyProps) {');
    expect(component).toContain('return null;');
  });
});
