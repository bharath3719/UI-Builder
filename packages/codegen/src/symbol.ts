/**
 * One symbol -> one component file and one stylesheet — PLAN.md §12.
 *
 * `page.ts`'s sibling, and deliberately shaped like it: the same walk (`walk.ts`) turns the
 * nodes into JSX, the same `serializePageStyles` writes the CSS (D6), and what differs is
 * only what the component declares above its return. A page declares state and queries; a
 * symbol declares its props, because that is the whole of what flows into it.
 *
 * The result is a component a person would have written. That is the point of generating
 * one file per symbol rather than inlining the subtree at each placement: an exported
 * project that used a card four times should contain one `Card`, not four copies of it, or
 * the export is a worse codebase than the document it came from.
 */

import {
  serializeNodeStyles,
  serializePageStyles,
  toComponentName,
  type SymbolDef,
  type SymbolProp,
  type Theme,
} from '@ui-builder/schema';
import type { EmitModule } from '@ui-builder/components';
import { printJsx, type JsxNode } from './ir.js';
// No `QUERY_MODULE`: a symbol has no queries of its own (§12), so nothing in one can
// reach for `useQuery`.
import { NAVIGATE_MODULE, TOAST_MODULE, VALUES_MODULE, type RuntimeModule } from './lib.js';
import {
  createWalk,
  isIdentifier,
  jsonLiteral,
  reads,
  walkNode,
  type SymbolTarget,
} from './walk.js';

export interface SymbolOutput {
  /** `ProductCard` — the exported component, the file stem, and the CSS Module's name. */
  name: string;
  tsx: string;
  css: string;
  usesStyles: boolean;
  modules: EmitModule[];
  runtime: RuntimeModule[];
  /** The other symbols this one places, so the project knows what it pulled in. */
  placed: SymbolTarget[];
  warnings: string[];
}

/** The TypeScript type a declared prop is annotated with. */
function propType(prop: SymbolProp): string {
  switch (prop.type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      // An enum is a string in the interface rather than a union of its options: the
      // options are editable in the builder and a union would make an exported project stop
      // compiling the moment someone widened one. `asEnum` in the library is what narrows.
      return 'string';
  }
}

/**
 * A prop's default, as the parameter default the component carries.
 *
 * This is the one place `?? defaultValue` is written for the export, and it is where the
 * runtime writes it too (`resolveSymbolProps`): an instance that stores no value for a prop
 * omits the attribute, and the default applies here. Writing it at every placement instead
 * would put the same literal in every page that used the component.
 */
function propDefault(prop: SymbolProp): string {
  if (prop.type === 'number') {
    return jsonLiteral(typeof prop.defaultValue === 'number' ? prop.defaultValue : 0);
  }
  if (prop.type === 'boolean') return jsonLiteral(prop.defaultValue === true);
  return jsonLiteral(typeof prop.defaultValue === 'string' ? prop.defaultValue : '');
}

export interface GenerateSymbolOptions {
  name?: string;
  /** Every symbol in the document, so a nested instance can be emitted as its component. */
  symbols?: readonly SymbolTarget[];
}

export function generateSymbol(
  symbol: SymbolDef,
  theme: Theme,
  options: GenerateSymbolOptions = {},
): SymbolOutput {
  const name = options.name ?? symbolComponentName(symbol);

  const nodes = Object.values(symbol.nodes);
  const css = serializePageStyles(nodes, theme);

  const styled = new Set<string>();
  for (const node of nodes) {
    if (serializeNodeStyles(node, theme).css !== '') styled.add(node.id);
  }

  const walk = createWalk({
    tree: symbol,
    symbols: options.symbols ?? [],
    styled,
    // The root element wears the class its caller handed in, which is what makes an
    // instance stylable without a wrapper element. See `classAttr` in `expand.ts`.
    rootExtraClass: 'className',
  });

  const statements: string[] = [];
  const walked: JsxNode | null = walkNode(symbol.rootId, walk, statements, true);

  const markup = walked === null ? null : printJsx(walked, 2);
  const scanned = [...statements, markup ?? ''].join('\n');

  /*
   * `props` is declared only when something reads it, exactly as a page's `state` is — the
   * generated project sets `noUnusedLocals`, so a binding nothing reads fails its build.
   *
   * It is an object rather than the destructured names because nothing rewrites what the
   * author typed: `{{ props.title }}` on the canvas has to be `props.title` here, and the
   * alternative is a source transform reliable enough to edit user code, which a regex is
   * not (§11's note on portability, one level down).
   */
  const usesProps = symbol.props.length > 0 && reads(scanned, 'props');

  const bindings = [
    ...(usesProps ? symbol.props.map((prop) => `${prop.name} = ${propDefault(prop)}`) : []),
    'className',
  ];

  const preamble: string[] = [];
  if (usesProps) {
    preamble.push(`const props = { ${symbol.props.map((prop) => prop.name).join(', ')} };`);
  }
  if (walk.needsToasts) preamble.push('const { toasts, showToast } = useToasts();');
  if (walk.needsGoTo) preamble.push('const goTo = useGoTo();');
  preamble.push(...statements);

  /* Imports. */
  const runtime: RuntimeModule[] = [];
  const lines: string[] = [];

  const react = [...walk.eventTypes].sort().map((type) => `type ${type}`);
  if (react.length > 0) lines.push(`import { ${react.join(', ')} } from 'react';`);

  if (walk.helpers.size > 0) {
    runtime.push(VALUES_MODULE);
    lines.push(
      `import { ${[...walk.helpers].sort().join(', ')} } from '${VALUES_MODULE.specifier}';`,
    );
  }
  if (walk.needsGoTo) {
    runtime.push(NAVIGATE_MODULE);
    lines.push(`import { useGoTo } from '${NAVIGATE_MODULE.specifier}';`);
  }
  if (walk.needsToasts) {
    runtime.push(TOAST_MODULE);
    lines.push(`import { Toasts, useToasts } from '${TOAST_MODULE.specifier}';`);
  }

  const modules = [...walk.modules].sort((a, b) => a.name.localeCompare(b.name));
  for (const module of modules) {
    lines.push(`import { ${module.name} } from '${module.specifier}';`);
  }

  // A nested symbol is a sibling file, so the specifier is `./` rather than the pages'
  // `../components/`.
  const placed = [...walk.placed].sort((a, b) => a.name.localeCompare(b.name));
  for (const target of placed) {
    lines.push(`import { ${target.name} } from './${target.name}';`);
  }

  if (walk.usedStyles) {
    if (lines.length > 0) lines.push('');
    lines.push(`import styles from './${name}.module.css';`);
  }
  const imports = lines.length > 0 ? `${lines.join('\n')}\n\n` : '';

  /* The props interface. */
  const fields = [
    ...symbol.props.map((prop) => `  ${propKey(prop)}?: ${propType(prop)};`),
    '  /** The one placement’s own styling, from whichever page or component placed it. */',
    '  className?: string;',
  ];
  const propsType = `export interface ${name}Props {\n${fields.join('\n')}\n}\n\n`;

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

  // A root the document rules out statically leaves a component with nothing to render.
  // The parameter stays — a page still passes props to it — and is named out of the way,
  // because the generated project's `noUnusedParameters` would reject it otherwise.
  const signature =
    markup === null ? `_props: ${name}Props` : destructured(bindings, `${name}Props`, name);
  const body =
    markup === null ? '  return null;\n' : `${declarations}  return (\n${markup}\n  );\n`;

  const tsx = `${imports}${propsType}export function ${name}(${signature}) {\n${body}}\n`;

  return {
    name,
    tsx,
    css,
    usesStyles: walk.usedStyles,
    modules,
    runtime,
    placed,
    warnings: walk.warnings,
  };
}

/**
 * The destructured parameter, broken across lines when it would run long.
 *
 * A component with six props and a default on each is well past a hundred columns on one
 * line, and the generated project is meant to be read and edited. The threshold counts
 * what `export function <name>(…) {` actually costs.
 */
function destructured(bindings: readonly string[], type: string, name: string): string {
  const inline = `{ ${bindings.join(', ')} }: ${type}`;
  if (`export function ${name}(${inline}) {`.length <= 100) return inline;
  return `{\n${bindings.map((binding) => `  ${binding},`).join('\n')}\n}: ${type}`;
}

/**
 * An object key for a prop.
 *
 * A prop name is always an identifier — `isValidVarName` enforces it when one is created —
 * so this is a guard rather than a branch anyone should hit, and it exists because a
 * document can outlive the rule that produced it.
 */
function propKey(prop: SymbolProp): string {
  return isIdentifier(prop.name) ? prop.name : `'${prop.name.replace(/'/g, "\\'")}'`;
}

/** What a symbol would be called if it were the only one — see `SymbolTarget`. */
function symbolComponentName(symbol: SymbolDef): string {
  return toComponentName(symbol.name, 'Component');
}
