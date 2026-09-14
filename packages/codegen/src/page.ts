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
  POWERBI_ADAPTER,
  resolveIntegrationRequest,
  resolvePowerBiRequest,
  type ExportIntegrations,
} from './integrations.js';
import {
  NAVIGATE_MODULE,
  POWERBI_MODULE,
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
  overlayDeclaration,
  reads,
  unguardedQueryReads,
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
  /**
   * Environment variables this page's requests read — the tokens of the workspace
   * connections it calls. The project writer turns these into `.env.example`, which is
   * how someone handed the export learns what to supply.
   */
  envVars: string[];
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

/**
 * A query's request, flattened to the fields `useQuery` takes.
 *
 * All three source kinds collapse to the same shape here, which is the point: an
 * integration query has had its connection folded in and its two template layers composed
 * into one (`resolveIntegrationRequest`), and a Power BI query has had its URL and its DAX
 * envelope assembled (`resolvePowerBiRequest`) — so from this line down there is no such
 * thing as a connection, only a method, a URL and some headers, exactly like a query
 * someone typed out by hand. The export therefore contains no integration machinery at all.
 *
 * The exception is `adapt`, and it is an honest one: a Power BI response has to be
 * unwrapped, that cannot happen at generation time because the response does not exist
 * yet, and so one function travels with the request. It is a named import from a generated
 * file, not a lookup in a catalogue.
 */
interface FlatRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
  authHeader?: { name: string; code: string };
  authQuery?: { name: string; code: string };
  /** Code that wins over `url`/`body` when a request's parts are assembled, not typed. */
  urlCode?: string;
  bodyCode?: string;
  /** The function the response goes through first — `powerbiRows`, or nothing. */
  adapt?: string;
}

function flattenSource(
  query: QueryDef,
  context: QueryContext,
  helpers: Helpers,
): { request: FlatRequest; tokenConst?: string } | { skipped: string } {
  const { source } = query;

  if (source.kind === 'url') {
    return {
      request: {
        method: source.method,
        url: source.url,
        headers: source.headers ?? {},
        body: source.body,
      },
    };
  }

  const resolved =
    source.kind === 'powerbi'
      ? resolvePowerBiRequest(source, context.integrations, (template) =>
          textExpression(template, helpers),
        )
      : resolveIntegrationRequest(source, context.integrations);

  if (!resolved.ok) {
    return { skipped: resolved.reason };
  }

  const { authHeader, authQuery, tokenConst, urlCode, bodyCode, adapt, ...rest } = resolved.request;

  return {
    request: {
      ...rest,
      ...(authHeader ? { authHeader } : {}),
      ...(authQuery ? { authQuery } : {}),
      ...(urlCode ? { urlCode } : {}),
      ...(bodyCode ? { bodyCode } : {}),
      ...(adapt ? { adapt } : {}),
    },
    ...(tokenConst ? { tokenConst } : {}),
  };
}

/** One query as the `useQuery` argument that describes it. */
function requestLiteral(
  request: FlatRequest,
  runOnLoad: boolean,
  helpers: Helpers,
  indent: string,
): string {
  // An API key in the query string is appended as code rather than folded into the
  // template, because the token is a constant this file declares and a template cannot
  // name one. Encoded the same way the runtime encodes it.
  const base = request.urlCode ?? textExpression(request.url, helpers);
  const url = request.authQuery
    ? `${base} + ${stringLiteral(
        `${request.url.includes('?') ? '&' : '?'}${encodeURIComponent(request.authQuery.name)}=`,
      )} + encodeURIComponent(${request.authQuery.code})`
    : base;

  const fields = [`method: ${stringLiteral(request.method)}`, `url: ${url}`];

  const headers = Object.entries(request.headers).map(
    ([name, value]) => `${objectKey(name)}: ${textExpression(value, helpers)}`,
  );
  if (request.authHeader) {
    headers.push(`${objectKey(request.authHeader.name)}: ${request.authHeader.code}`);
  }
  if (headers.length > 0) fields.push(`headers: { ${headers.join(', ')} }`);

  if (request.bodyCode !== undefined) fields.push(`body: ${request.bodyCode}`);
  else if (request.body !== undefined)
    fields.push(`body: ${textExpression(request.body, helpers)}`);
  fields.push(`runOnLoad: ${runOnLoad}`);
  // Last, because it is the one field that is not part of the request: it says what to do
  // with the answer, and reads better after the thing being sent.
  if (request.adapt !== undefined) fields.push(`adapt: ${request.adapt}`);

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
function queryDeclarations(
  page: Page,
  body: string,
  helpers: Helpers,
  context: QueryContext,
): string[] {
  if (page.queries.length === 0) return [];

  const cyclic = cyclicQueries(page.queries);
  const runs = (query: QueryDef): boolean => query.runOnLoad && !cyclic.has(query.id);

  /**
   * Flattened once, up front, because a query that cannot be resolved must be left out of
   * *both* branches below and reported exactly once. Emitting it with an empty URL would
   * be the silent failure this generator spends its warnings avoiding.
   */
  const resolved = page.queries.flatMap((query) => {
    const flat = flattenSource(query, context, helpers);
    if ('skipped' in flat) {
      context.warnings.push(
        `Query "${query.name}" was left out of the export because ${flat.skipped}.`,
      );
      return [];
    }
    if (flat.tokenConst) context.tokens.add(flat.tokenConst);
    return [{ query, request: flat.request }];
  });

  if (resolved.length === 0) return [];

  /*
   * A request can read another query's result — `?id={{ queries.first.data.id }}` — and
   * that reference lives in the request rather than in the markup. Deciding on the markup
   * alone emitted bare `useQuery(...)` calls mentioning a `queries` object nobody had
   * declared, which is a project that does not compile. Rendered once here rather than
   * being threaded out of the branches below, which take different indentation and a
   * different `runOnLoad` and so cannot share a literal.
   */
  const requestText = resolved
    .map((entry) => requestLiteral(entry.request, runs(entry.query), helpers, ''))
    .join('\n');

  // Indentation here is relative: `generatePage` indents every preamble statement by one
  // level when it assembles the component body, so these are written at column zero.
  if (!reads(body, 'queries') && !reads(requestText, 'queries')) {
    return resolved
      .filter((entry) => runs(entry.query))
      .map(
        (entry) =>
          `// ${entry.query.name} — sent on load; nothing on this page reads its result.\nuseQuery(${requestLiteral(entry.request, true, helpers, '')});`,
      );
  }

  const fields = resolved.map(
    (entry) =>
      `${objectKey(entry.query.name)}: useQuery(${requestLiteral(entry.request, runs(entry.query), helpers, '  ')})`,
  );

  return [`const queries = {\n${fields.map((field) => `  ${field},`).join('\n')}\n};`];
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What resolving a page's queries needs, and what it produces on the side.
 *
 * `warnings` and `tokens` are collected rather than returned because they belong to the
 * *project*, not the page: a missing connection is one warning for the person exporting,
 * and a token constant is declared once in the module regardless of how many queries on
 * the page read it.
 */
interface QueryContext {
  integrations: ExportIntegrations;
  warnings: string[];
  tokens: Set<string>;
}

export interface GeneratePageOptions {
  /** Overrides the name derived from `page.name`, for de-duplication across pages. */
  name?: string;
  /** The document's symbols, with the names the project settled on for them. */
  symbols?: readonly SymbolTarget[];
  /**
   * The workspace connections this document's queries reference, resolved at generation
   * time. Absent means none are available, which turns every integration query into a
   * warning rather than a broken request — the right answer for a caller that has no
   * workspace context, such as a unit test over a document alone.
   */
  integrations?: ExportIntegrations;
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

  const queryContext: QueryContext = {
    integrations: options.integrations ?? {},
    warnings: [],
    tokens: new Set(),
  };

  // Generated before the state declaration although it is written after it, because a
  // query's *request* can read state — a URL with a hole in it, a DAX statement filtered by
  // a variable — and those references appear nowhere in the markup. Scanning only the
  // markup emitted a page that read `state.dataset` without declaring `state`, which is a
  // project that does not compile rather than one that renders wrongly.
  const queries = queryDeclarations(page, scanned, walk.helpers, queryContext);

  const preamble: string[] = [];
  const state = stateDeclaration(page, [scanned, ...queries].join('\n'));
  if (state) preamble.push(state);
  preamble.push(...queries);
  // After the two above, so an overlay seeded from a binding can read them — it is an
  // expression like any other, and the names it may mention are already in scope.
  const overlays = overlayDeclaration(walk);
  if (overlays) preamble.push(overlays);
  if (walk.needsToasts) preamble.push('const { toasts, showToast } = useToasts();');
  if (walk.needsGoTo) preamble.push('const goTo = useGoTo();');
  preamble.push(...statements);

  const usesState = state !== null || overlays !== null;
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
  // Read off what was written rather than off the page, for `usesQueries`' reason one line
  // up: a Power BI query that was skipped as unresolvable, or dropped because nothing on
  // the page reads it, must not leave an import of a module nothing calls — the generated
  // project sets `noUnusedLocals` and would refuse to build.
  if (usesQueries && preamble.some((line) => line.includes(`adapt: ${POWERBI_ADAPTER}`))) {
    runtime.push(POWERBI_MODULE);
    lines.push(`import { ${POWERBI_ADAPTER} } from '${POWERBI_MODULE.specifier}';`);
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

  /*
   * Token constants sit at module scope, above the component, because they are
   * configuration and not state: they do not change between renders, and reading them
   * inside the component would suggest they might. Sorted, so the same page always writes
   * the same file.
   *
   * `?? ''` rather than a throw. A deployment that forgot a variable then sends an
   * unauthenticated request and gets a 401 back from the API it was calling — which names
   * the connection that is misconfigured. Throwing on boot gives a white screen instead.
   */
  const tokenLines = [...queryContext.tokens]
    .sort()
    .map((constName) => `const ${constName} = import.meta.env.VITE_${constName} ?? '';`);
  const tokens = tokenLines.length > 0 ? `${tokenLines.join('\n')}\n\n` : '';

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

  const tsx = `${imports}${tokens}export function ${name}() {\n${declarations}  return (\n${markup}\n  );\n}\n`;

  return {
    name,
    tsx,
    css,
    usesStyles: walk.usedStyles,
    modules,
    runtime,
    warnings: [...walk.warnings, ...queryContext.warnings, ...unguardedQueryReads(page)],
    envVars: [...queryContext.tokens].sort().map((constName) => `VITE_${constName}`),
  };
}
