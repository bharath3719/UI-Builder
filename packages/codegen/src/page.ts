/**
 * One page of a document -> one component file and one stylesheet.
 *
 * The CSS half is a call, not a design: `serializePageStyles` is the same function the
 * canvas injects into its iframe and the preview renders with (D6). If the export ever
 * disagrees with the canvas about a declaration, it is because someone gave codegen its
 * own copy of that function — so it does not have one.
 *
 * The other half is what Phase 11 added: a page that carries state, queries and handlers
 * is a component with a body and not only a `return`. Everything above the return is
 * assembled here, and the order it is assembled in is the order it is written — state,
 * then the queries whose requests may read it, then the handlers that write both. What
 * goes in it is decided by what the walk turned out to need, which is why the JSX is
 * printed first and the preamble built afterwards: a page cannot know it needs `useState`
 * until it knows whether anything on it reads a variable.
 *
 * The walk itself is in `walk.ts`, shared with `symbol.ts` — a page and a symbol turn
 * nodes into elements identically and differ only in what they declare above the return.
 */

import type { EmitModule } from '@ui-builder/components';
import {
  cyclicQueries,
  serializeNodeStyles,
  serializePageStyles,
  toComponentName,
  type Page,
  type QueryDef,
  type Theme,
} from '@ui-builder/schema';
import { element, printJsx, stringLiteral, type JsxNode } from './ir.js';
import {
  NAVIGATE_MODULE,
  QUERY_MODULE,
  TOAST_MODULE,
  VALUES_MODULE,
  type RuntimeModule,
} from './lib.js';
import { textExpression, type Helpers } from './values.js';
import {
  createWalk,
  jsonLiteral,
  objectKey,
  objectLiteral,
  reads,
  walkNode,
  type SymbolTarget,
} from './walk.js';

export { jsonLiteral } from './walk.js';

/**
 * A page's component name and file stem, derived from the name in the layers panel.
 *
 * A page called `404` or `Sign in` has to become a legal identifier, and two pages
 * called `Home` have to become two different files, so the caller de-duplicates — this
 * only guarantees the name is usable. The derivation itself is in `schema` because a
 * symbol's spec needs the same one and cannot reach this package (PLAN.md §2).
 */
export function componentName(name: string): string {
  return toComponentName(name, 'Page');
}

export interface PageOutput {
  /** `Home` — the exported component, the file stem, and the CSS Module's base name. */
  name: string;
  tsx: string;
  css: string;
  /** Whether `tsx` imports the module, and therefore whether the module is worth writing. */
  usesStyles: boolean;
  /**
   * Runtime modules this page imports — the behaviour a page needs that markup cannot
   * carry (`EmitModule`). The project writer ships each file once, however many pages
   * reached for it, and a document with no such component ships none of them.
   */
  modules: EmitModule[];
  /**
   * The files in `src/lib/` this page needs, collected the same way and for the same
   * reason: a document with no bindings and no queries ships none of them (`lib.ts`).
   */
  runtime: RuntimeModule[];
  /** Components the document names that the library no longer has. */
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* The component body                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The state declaration, or null when nothing on the page would read it.
 *
 * One object rather than a variable per name, because that is what makes the expression
 * text portable: `state.count` means the same thing on the canvas and here, with nothing
 * rewriting what the author typed (§11). Typed loosely on purpose — an expression can put
 * anything in a variable, and a project that will not compile is worse than one whose
 * state is not narrowed.
 */
function stateDeclaration(page: Page, body: string): string | null {
  if (page.state.length === 0) return null;

  const usesValues = reads(body, 'state');
  const usesSetter = reads(body, 'setState');
  if (!usesValues && !usesSetter) return null;

  // Array elision rather than an unused binding: the generated project sets
  // `noUnusedLocals`, so naming a half nobody reads would fail its build.
  const binding = usesValues ? (usesSetter ? '[state, setState]' : '[state]') : '[, setState]';
  const fields = page.state.map(
    (variable) => `${objectKey(variable.name)}: ${jsonLiteral(variable.initial)}`,
  );

  return `const ${binding} = useState<Record<string, any>>(${objectLiteral(fields, '  ')});`;
}

/** One query as the `useQuery` argument that describes it. */
function requestLiteral(
  query: QueryDef,
  runOnLoad: boolean,
  helpers: Helpers,
  indent: string,
): string {
  const fields = [
    `method: ${stringLiteral(query.method)}`,
    `url: ${textExpression(query.url, helpers)}`,
  ];

  const headers = Object.entries(query.headers ?? {});
  if (headers.length > 0) {
    fields.push(
      `headers: { ${headers
        .map(([name, value]) => `${objectKey(name)}: ${textExpression(value, helpers)}`)
        .join(', ')} }`,
    );
  }
  if (query.body !== undefined) fields.push(`body: ${textExpression(query.body, helpers)}`);
  fields.push(`runOnLoad: ${runOnLoad}`);

  // Always broken across lines: a request is the one thing in a generated page someone
  // actually reads before editing it, and a URL with an interpolation in it is long.
  return `{\n${fields.map((field) => `${indent}  ${field},`).join('\n')}\n${indent}}`;
}

/**
 * The query declarations.
 *
 * A page that reads `queries` gets the object its expressions name. One that does not
 * still has to *send* anything set to run on load — a request whose result nothing shows
 * is unusual but not meaningless — so those become bare calls, and a query that neither
 * runs nor is read is left out entirely, because it would do nothing at all.
 */
function queryDeclarations(page: Page, body: string, helpers: Helpers): string[] {
  if (page.queries.length === 0) return [];

  const cyclic = cyclicQueries(page.queries);
  const runs = (query: QueryDef): boolean => query.runOnLoad && !cyclic.has(query.id);

  // Indentation here is relative: `generatePage` indents every preamble statement by one
  // level when it assembles the component body, so these are written at column zero.
  if (!reads(body, 'queries')) {
    return page.queries
      .filter(runs)
      .map(
        (query) =>
          `// ${query.name} — sent on load; nothing on this page reads its result.\nuseQuery(${requestLiteral(query, true, helpers, '')});`,
      );
  }

  const fields = page.queries.map(
    (query) =>
      `${objectKey(query.name)}: useQuery(${requestLiteral(query, runs(query), helpers, '  ')})`,
  );

  return [`const queries = {\n${fields.map((field) => `  ${field},`).join('\n')}\n};`];
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

export interface GeneratePageOptions {
  /** Overrides the name derived from `page.name`, for de-duplication across pages. */
  name?: string;
  /** The document's symbols, with the names the project settled on for them. */
  symbols?: readonly SymbolTarget[];
}

export function generatePage(
  page: Page,
  theme: Theme,
  options: GeneratePageOptions = {},
): PageOutput {
  const name = options.name ?? componentName(page.name);

  // Every node in the page, exactly as the runtime does it — orphans included, so a
  // stylesheet diff against the canvas is a diff about styles and not about traversal.
  const nodes = Object.values(page.nodes);
  const css = serializePageStyles(nodes, theme);

  // Which nodes actually produced rules. A node with none must not reference the CSS
  // Module, or its class list picks up an `undefined`.
  const styled = new Set<string>();
  for (const node of nodes) {
    if (serializeNodeStyles(node, theme).css !== '') styled.add(node.id);
  }

  const walk = createWalk({
    tree: page,
    state: page.state,
    queries: page.queries,
    symbols: options.symbols ?? [],
    styled,
  });

  const statements: string[] = [];
  const walked = walkNode(page.rootId, walk, statements) ?? element('div');

  // A page whose root is conditional or repeated is not one element, and `return {…}` is a
  // block rather than an expression. The fragment is also where the toast host goes.
  const body: JsxNode =
    walked.kind === 'element' && !walk.needsToasts
      ? walked
      : {
          kind: 'fragment',
          children: walk.needsToasts
            ? [walked, element('Toasts', [{ name: 'toasts', kind: 'expr', code: 'toasts' }])]
            : [walked],
        };

  const markup = printJsx(body, 2);
  const scanned = [...statements, markup].join('\n');

  const preamble: string[] = [];
  const state = stateDeclaration(page, scanned);
  if (state) preamble.push(state);
  preamble.push(...queryDeclarations(page, scanned, walk.helpers));
  if (walk.needsToasts) preamble.push('const { toasts, showToast } = useToasts();');
  if (walk.needsGoTo) preamble.push('const goTo = useGoTo();');
  preamble.push(...statements);

  const usesState = state !== null;
  const usesQueries =
    page.queries.length > 0 && preamble.some((line) => line.includes('useQuery('));

  /* Imports. */
  const runtime: RuntimeModule[] = [];
  const lines: string[] = [];

  const react = [
    ...(usesState ? ['useState'] : []),
    ...[...walk.eventTypes].sort().map((type) => `type ${type}`),
  ];
  if (react.length > 0) lines.push(`import { ${react.join(', ')} } from 'react';`);

  if (walk.helpers.size > 0) {
    runtime.push(VALUES_MODULE);
    lines.push(
      `import { ${[...walk.helpers].sort().join(', ')} } from '${VALUES_MODULE.specifier}';`,
    );
  }
  if (usesQueries) {
    runtime.push(QUERY_MODULE);
    lines.push(`import { useQuery } from '${QUERY_MODULE.specifier}';`);
  }
  if (walk.needsGoTo) {
    runtime.push(NAVIGATE_MODULE);
    lines.push(`import { useGoTo } from '${NAVIGATE_MODULE.specifier}';`);
  }
  if (walk.needsToasts) {
    runtime.push(TOAST_MODULE);
    lines.push(`import { Toasts, useToasts } from '${TOAST_MODULE.specifier}';`);
  }

  // Sorted by name rather than left in walk order, so the same page always writes the
  // same file: the walk order is the document's tree, and moving a node around the canvas
  // must not show up as a diff in an import block.
  const modules = [...walk.modules].sort((a, b) => a.name.localeCompare(b.name));
  for (const module of modules) {
    lines.push(`import { ${module.name} } from '${module.specifier}';`);
  }

  // The project's own components, after the runtime and before the stylesheet — a page
  // reads as what it renders with, then what it is styled by.
  const placed = [...walk.placed].sort((a, b) => a.name.localeCompare(b.name));
  for (const target of placed) {
    lines.push(`import { ${target.name} } from '../components/${target.name}';`);
  }

  if (walk.usedStyles) {
    // A blank line between what the page renders with and what it is styled by, which is
    // how the files in this repo group their own imports.
    if (lines.length > 0) lines.push('');
    lines.push(`import styles from './${name}.module.css';`);
  }
  const imports = lines.length > 0 ? `${lines.join('\n')}\n\n` : '';

  const declarations =
    preamble.length === 0
      ? ''
      : `${preamble
          .map((statement) =>
            statement
              .split('\n')
              .map((line) => (line === '' ? '' : `  ${line}`))
              .join('\n'),
          )
          .join('\n\n')}\n\n`;

  const tsx = `${imports}export function ${name}() {\n${declarations}  return (\n${markup}\n  );\n}\n`;

  return {
    name,
    tsx,
    css,
    usesStyles: walk.usedStyles,
    modules,
    runtime,
    warnings: walk.warnings,
  };
}
