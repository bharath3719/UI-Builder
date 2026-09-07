/**
 * Snapshot tests — PLAN.md §14.
 *
 * The contract is byte-stability: a fixture document produces exactly these files, so a
 * diff here is a change to what every user's export looks like. Reviewing that diff is
 * the point, which is why the page and its stylesheet are snapshotted as text rather
 * than asserted on piecemeal.
 */

import { COMPONENT_CSS, SORTABLE_ROWS } from '@ui-builder/components';
import {
  makeNode,
  makePage,
  serializePageStyles,
  serializeTheme,
  staticProp,
  type ProjectDoc,
} from '@ui-builder/schema';
import { describe, expect, test } from 'vitest';
import { bareDoc, demoDoc } from './fixtures.js';
import { generateProject, packageSlug, type VirtualFile } from './project.js';

function fileAt(files: VirtualFile[], path: string): string {
  const file = files.find((each) => each.path === path);
  if (!file) throw new Error(`no ${path} in [${files.map((each) => each.path).join(', ')}]`);
  return file.contents;
}

describe('the emitted project', () => {
  test('has the files a Vite app needs, and no others', () => {
    const { files } = generateProject(demoDoc());

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
      'src/pages/AboutUs.tsx',
      'src/components/SortableRows.tsx',
    ]);
  });

  test('routes every page', () => {
    const app = fileAt(generateProject(demoDoc()).files, 'src/App.tsx');
    expect(app).toMatchSnapshot();
  });

  test('names two pages that share a label apart', () => {
    const doc = demoDoc();
    doc.pages[1]!.name = 'Home';

    const paths = generateProject(doc).files.map((file) => file.path);
    expect(paths).toContain('src/pages/Home.tsx');
    expect(paths).toContain('src/pages/Home2.tsx');
  });

  test('writes no stylesheet for a page that has no styles', () => {
    const { files } = generateProject(bareDoc());

    expect(files.map((file) => file.path)).not.toContain('src/pages/Home.module.css');
    // …and the component must not import one either, or `noUnusedLocals` in the
    // generated project rejects its own output.
    expect(fileAt(files, 'src/pages/Home.tsx')).not.toContain('import styles');
  });

  test('slugs the document name for npm', () => {
    expect(packageSlug('Demo Project')).toBe('demo-project');
    expect(packageSlug('  ...  ')).toBe('ui-builder-export');
    expect(JSON.parse(fileAt(generateProject(demoDoc()).files, 'package.json')).name).toBe(
      'demo-project',
    );
  });

  test('escapes the document name on its way into markup', () => {
    const doc = demoDoc();
    doc.name = 'A <script> & "quotes"';

    expect(fileAt(generateProject(doc).files, 'index.html')).toContain(
      '<title>A &lt;script&gt; &amp; &quot;quotes&quot;</title>',
    );
  });
});

/** A document whose every page is one table with rows that can be dragged. */
function tableDoc(pages: number): ProjectDoc {
  const doc = bareDoc();
  doc.pages = Array.from({ length: pages }, (_, index) => {
    const root = makeNode({
      id: `t${index}`,
      type: 'Table',
      name: 'Table',
      props: {
        columns: staticProp('Name'),
        rows: staticProp('Ada'),
        reorderable: staticProp(true),
      },
    });
    return makePage({
      id: `p${index}`,
      name: `Page${index}`,
      path: index === 0 ? '/' : `/page-${index}`,
      rootId: root.id,
      nodes: { [root.id]: root },
    });
  });
  return doc;
}

describe('runtime modules', () => {
  test('ships the module once, however many pages reach for it', () => {
    const { files } = generateProject(tableDoc(3));

    const shipped = files.filter((file) => file.path.startsWith('src/components/'));
    expect(shipped.map((file) => file.path)).toEqual(['src/components/SortableRows.tsx']);
    // Verbatim, for `library.css`'s reason: the component the export ships is the
    // component the canvas rendered, so there is nowhere for the two to drift apart.
    expect(shipped[0]!.contents).toBe(SORTABLE_ROWS.source);
  });

  test('every page that reaches for it imports it by the path it landed at', () => {
    const { files } = generateProject(tableDoc(2));

    for (const name of ['Page0', 'Page1']) {
      expect(fileAt(files, `src/pages/${name}.tsx`)).toContain(
        "import { SortableRows } from '../components/SortableRows';",
      );
    }
  });

  test('ships nothing for a document that is only markup, and says nothing about it', () => {
    // Which is nearly every document. The escape hatch costs an export that does not use
    // it a file it would have to read and a paragraph it would have to believe.
    const { files } = generateProject(bareDoc());

    expect(files.filter((file) => file.path.startsWith('src/components/'))).toEqual([]);
    expect(fileAt(files, 'README.md')).not.toContain('src/components');
    expect(fileAt(files, 'README.md')).toContain('src/library.css');
  });

  test('tells the reader of an export that uses one where it came from', () => {
    expect(fileAt(generateProject(tableDoc(1)).files, 'README.md')).toContain('src/components/');
  });
});

describe('fidelity (D6)', () => {
  test('the page stylesheet is the serializer output, untouched', () => {
    const doc = demoDoc();
    const css = fileAt(generateProject(doc).files, 'src/pages/Home.module.css');

    // Not "looks like" — is. Codegen owns no copy of this function, so the export
    // cannot drift from what the canvas and the preview render.
    expect(css).toBe(`${serializePageStyles(Object.values(doc.pages[0]!.nodes), doc.theme)}\n`);
  });

  test('the theme and the library sheet ship verbatim', () => {
    const doc = demoDoc();
    const { files } = generateProject(doc);

    expect(fileAt(files, 'src/theme.css')).toBe(`${serializeTheme(doc.theme)}\n`);
    expect(fileAt(files, 'src/library.css')).toBe(`${COMPONENT_CSS}\n`);
  });

  test('main.tsx loads the three sheets in cascade order', () => {
    const main = fileAt(generateProject(demoDoc()).files, 'src/main.tsx');

    const theme = main.indexOf("import './theme.css'");
    const library = main.indexOf("import './library.css'");
    const app = main.indexOf("from './App'");

    expect(theme).toBeGreaterThan(-1);
    expect(theme).toBeLessThan(library);
    expect(library).toBeLessThan(app);
  });
});

describe('determinism', () => {
  test('the same document generates the same bytes', () => {
    expect(generateProject(demoDoc())).toEqual(generateProject(demoDoc()));
  });
});

describe('snapshots', () => {
  test('Home.tsx', () => {
    expect(fileAt(generateProject(demoDoc()).files, 'src/pages/Home.tsx')).toMatchSnapshot();
  });

  test('Home.module.css', () => {
    expect(fileAt(generateProject(demoDoc()).files, 'src/pages/Home.module.css')).toMatchSnapshot();
  });

  test('AboutUs.tsx', () => {
    expect(fileAt(generateProject(demoDoc()).files, 'src/pages/AboutUs.tsx')).toMatchSnapshot();
  });

  test('warnings', () => {
    expect(generateProject(demoDoc()).warnings).toMatchSnapshot();
  });
});
