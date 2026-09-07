/**
 * A document -> a Vite + React project, as files in memory — PLAN.md §11.
 *
 * Pure: no `fs`, no `zip`, no clock. The API's export route writes these to a stream and
 * the studio's code panel shows them in a tab, and neither can produce something the
 * other cannot, because there is only the one function.
 *
 * The stylesheet order in `main.tsx` is load-bearing and is the same order `PageRenderer`
 * assembles its `<style>` in: theme tokens, then the library's base rules, then the
 * per-node rules a page module carries. A declaration written in the inspector has to
 * beat the component's own without extra specificity, and source order is what makes
 * that true — in the export as on the canvas (D6).
 */

import { COMPONENT_CSS } from '@ui-builder/components';
import { serializeTheme, toComponentName, type ProjectDoc } from '@ui-builder/schema';
import { componentName, generatePage, type PageOutput } from './page.js';
import { generateSymbol, type SymbolOutput } from './symbol.js';
import type { SymbolTarget } from './walk.js';

export interface VirtualFile {
  /** Forward-slashed and relative to the project root, on every platform. */
  path: string;
  contents: string;
}

export interface GeneratedProject {
  files: VirtualFile[];
  /** Nodes that could not be exported. Empty for a document the studio produced. */
  warnings: string[];
}

export interface GenerateOptions {
  /** `package.json` name. Defaults to a slug of the document's name. */
  packageName?: string;
}

/**
 * The versions this repo itself builds against, pinned rather than floated.
 *
 * An export is a handover: it has to install and run months later, and `^` on five
 * packages is five chances for it not to. They are listed here rather than read from a
 * workspace manifest because this function has no I/O.
 */
const DEPENDENCIES = {
  react: '^19.2.8',
  'react-dom': '^19.2.8',
  'react-router': '^7.18.3',
};

const DEV_DEPENDENCIES = {
  '@types/react': '^19.2.18',
  '@types/react-dom': '^19.2.7',
  '@vitejs/plugin-react': '^6.1.1',
  typescript: '^6.0.3',
  vite: '^8.2.2',
};

/** npm's rules: lowercase, url-safe, non-empty. */
export function packageSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'ui-builder-export' : slug;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Names for a list of things called after their labels, de-duplicated.
 *
 * Two pages can legitimately be called the same thing — the name is a label in the layers
 * panel, not a key — and two files cannot. The first keeps the plain name so the common
 * case reads as expected. Symbols go through the same function, and through the *same*
 * `taken` set is deliberately not what happens: a page and a component live in different
 * directories, so `Card` may be both.
 */
function uniqueNames(labels: readonly string[], derive: (label: string) => string): string[] {
  const taken = new Set<string>();
  return labels.map((label) => {
    const base = derive(label);
    let name = base;
    let index = 2;
    while (taken.has(name)) {
      name = `${base}${index}`;
      index += 1;
    }
    taken.add(name);
    return name;
  });
}

function appFile(pages: { name: string; path: string }[]): string {
  const imports = pages
    .map((page) => `import { ${page.name} } from './pages/${page.name}';`)
    .join('\n');

  const routes = pages
    .map((page) => `        <Route path="${page.path}" element={<${page.name} />} />`)
    .join('\n');

  return `import { BrowserRouter, Route, Routes } from 'react-router';
${imports}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
${routes}
      </Routes>
    </BrowserRouter>
  );
}
`;
}

const MAIN = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Order matters: theme tokens, then the component library's base rules, then each page's
// own rules, which arrive with the page module below. A style written in the builder
// wins on source order alone, which is what keeps it from needing extra specificity.
import './theme.css';
import './library.css';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

const VITE_CONFIG = `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
});
`;

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2023',
    lib: ['ES2023', 'DOM', 'DOM.Iterable'],
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsx',
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    verbatimModuleSyntax: true,
    isolatedModules: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ['src', 'vite.config.ts'],
};

const GITIGNORE = `node_modules
dist
*.local
`;

/**
 * Vite's ambient types. Without it `tsc` rejects the project's own stylesheets: a
 * side-effect `import './theme.css'` has no module to resolve, and `*.module.css` has no
 * type at all — so `npm run build` would fail on the first thing a user tries.
 */
const VITE_ENV = `/// <reference types="vite/client" />
`;

function indexHtml(title: string): string {
  // The document's name is user input on its way into markup.
  const safe = title.replace(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    };
    return entities[character]!;
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safe}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function readme(name: string, hasComponents: boolean, hasRuntime: boolean): string {
  // Mentioned only when the folder exists. A README that points at a directory the export
  // does not contain is worse than one that says less.
  const components = hasComponents
    ? `- \`src/components/\` — the few pieces that are behaviour rather than markup, such as
  the table body whose rows can be dragged. The pages hand them their content, so
  changing how something looks means editing the page, not these.
`
    : '';

  const runtime = hasRuntime
    ? `- \`src/lib/\` — the small amount each page shares: how a bound value becomes text, how
  a request becomes a result, where a message pops up. A page's own state, its requests
  and its event handlers are written into the page itself, so that is where to read them.
`
    : '';

  return `# ${name}

Exported from UI Builder.

\`\`\`sh
npm install
npm run dev
\`\`\`

## What is where

- \`src/theme.css\` — the design tokens, as CSS custom properties. Retuning a token
  here retunes everything built on it.
- \`src/library.css\` — the component library's base rules, exactly as they were on the
  canvas. Every selector weighs one class, so a page's own rules always win.
- \`src/pages/*.module.css\` — the per-element rules the builder wrote. Class names are
  the node ids they came from.
${components}${runtime}

The three are loaded in that order by \`src/main.tsx\`, and that order is what makes the
cascade work. Reordering them will change how the pages look.
`;
}

export function generateProject(doc: ProjectDoc, options: GenerateOptions = {}): GeneratedProject {
  // The symbols first, because a page's walk has to know what a symbol instance is called
  // before it can emit one — and a symbol can place another symbol, so every name is
  // settled before any file is written.
  const symbolNames = uniqueNames(
    doc.symbols.map((symbol) => symbol.name),
    (label) => toComponentName(label, 'Component'),
  );
  const symbols: SymbolTarget[] = doc.symbols.map((symbol, index) => ({
    symbol,
    name: symbolNames[index]!,
  }));

  const symbolOutputs: SymbolOutput[] = doc.symbols.map((symbol, index) =>
    generateSymbol(symbol, doc.theme, { name: symbolNames[index]!, symbols }),
  );

  const names = uniqueNames(
    doc.pages.map((page) => page.name),
    componentName,
  );
  const outputs: PageOutput[] = doc.pages.map((page, index) =>
    generatePage(page, doc.theme, { name: names[index], symbols }),
  );

  const everything = [...symbolOutputs, ...outputs];

  // The runtime modules the pages import — one file each however many pages reached for
  // one, and none at all for a document made only of markup, which is most of them. Keyed
  // by path rather than by identity so that the file is written once even if two specs
  // ever hold separate copies of the same module.
  const modules = new Map(
    everything.flatMap((output) => output.modules).map((module) => [module.path, module]),
  );

  // The same rule for `src/lib/`: a page reaches for a file, the project ships it once, and
  // a document made only of static markup ships none of them at all.
  const runtime = new Map(
    everything.flatMap((output) => output.runtime).map((module) => [module.path, module]),
  );

  const files: VirtualFile[] = [
    {
      path: 'package.json',
      contents: json({
        name: options.packageName ?? packageSlug(doc.name),
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'tsc --noEmit && vite build',
          preview: 'vite preview',
        },
        dependencies: DEPENDENCIES,
        devDependencies: DEV_DEPENDENCIES,
      }),
    },
    { path: 'index.html', contents: indexHtml(doc.name) },
    { path: 'vite.config.ts', contents: VITE_CONFIG },
    { path: 'tsconfig.json', contents: json(TSCONFIG) },
    { path: '.gitignore', contents: GITIGNORE },
    { path: 'README.md', contents: readme(doc.name, modules.size > 0, runtime.size > 0) },
    { path: 'src/vite-env.d.ts', contents: VITE_ENV },
    { path: 'src/main.tsx', contents: MAIN },
    {
      path: 'src/App.tsx',
      contents: appFile(doc.pages.map((page, index) => ({ name: names[index]!, path: page.path }))),
    },
    { path: 'src/theme.css', contents: `${serializeTheme(doc.theme)}\n` },
    { path: 'src/library.css', contents: `${COMPONENT_CSS}\n` },
  ];

  for (const output of outputs) {
    files.push({ path: `src/pages/${output.name}.tsx`, contents: output.tsx });
    // A page with no styled nodes gets no module, and its component imports none.
    if (output.usesStyles) {
      files.push({ path: `src/pages/${output.name}.module.css`, contents: `${output.css}\n` });
    }
  }

  // The document's own components, beside the `EmitModule` files in the same directory.
  // They are the same kind of thing from the project's point of view — a component the
  // pages import rather than markup written into them — which is why they share a folder.
  for (const output of symbolOutputs) {
    files.push({ path: `src/components/${output.name}.tsx`, contents: output.tsx });
    if (output.usesStyles) {
      files.push({ path: `src/components/${output.name}.module.css`, contents: `${output.css}\n` });
    }
  }

  for (const [path, module] of [...modules, ...runtime].sort(([a], [b]) => a.localeCompare(b))) {
    files.push({ path, contents: module.source });
  }

  return { files, warnings: everything.flatMap((output) => output.warnings) };
}
