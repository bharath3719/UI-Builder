/**
 * Style serialization — PLAN.md §3, decision D6.
 *
 * One function turns a node's structured `StyleSet` into CSS text. The canvas
 * collects that text into a `<style>` tag inside the iframe; the code generator
 * collects the identical text into a `Page.module.css`. Because both consume the same
 * output of the same function, the canvas physically cannot drift from the export.
 */

import { resolveDecls } from './cascade.js';
import type { Node, StyleDecls, StyleSet, StyleState, Theme } from './doc.js';

/**
 * CSS properties whose numeric values are counts, ratios or multipliers. Everything
 * not listed gets `px` appended, matching what React's `style` prop does — so a
 * number typed into the inspector means the same thing on the canvas as in the
 * exported stylesheet.
 */
const UNITLESS = new Set([
  'animation-iteration-count',
  'aspect-ratio',
  'border-image-outset',
  'border-image-slice',
  'border-image-width',
  'box-flex',
  'column-count',
  'columns',
  'flex',
  'flex-grow',
  'flex-positive',
  'flex-shrink',
  'flex-negative',
  'flex-order',
  'font-weight',
  'grid-area',
  'grid-column',
  'grid-column-end',
  'grid-column-start',
  'grid-row',
  'grid-row-end',
  'grid-row-start',
  'line-clamp',
  'line-height',
  'opacity',
  'order',
  'orphans',
  'scale',
  'tab-size',
  'widows',
  'z-index',
  'zoom',
]);

/** `paddingTop` -> `padding-top`, `WebkitLineClamp` -> `-webkit-line-clamp`. */
export function kebabCase(property: string): string {
  return property
    .replace(/^(Webkit|Moz|ms|O)/, (prefix) => `-${prefix.toLowerCase()}`)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

const SAFE_PROPERTY = /^-{0,2}[a-z][a-z0-9-]*$/;

/**
 * The declaration text ends up inside a `<style>` element that the studio injects.
 * A value carrying `}` or `<` could close the rule (or the element) and start
 * writing arbitrary CSS — or, with `</style`, arbitrary markup — so the characters
 * that can leave a declaration are removed rather than escaped. None of them are
 * meaningful inside a single property value.
 */
function sanitizeValue(value: string): string {
  return value.replace(/[<>{};@\\]/g, '').trim();
}

function declarationText(property: string, raw: string | number): string | null {
  const name = kebabCase(property);
  if (!SAFE_PROPERTY.test(name)) return null;

  const value =
    typeof raw === 'number'
      ? Number.isFinite(raw)
        ? UNITLESS.has(name) || raw === 0
          ? String(raw)
          : `${raw}px`
        : null
      : sanitizeValue(raw);

  if (value === null || value === '') return null;
  return `${name}: ${value};`;
}

function declarationsText(decls: StyleDecls, indent: string): string {
  const lines: string[] = [];
  for (const [property, value] of Object.entries(decls)) {
    const text = declarationText(property, value);
    if (text) lines.push(indent + text);
  }
  return lines.join('\n');
}

/**
 * How each pseudo-state narrows the selector. `focus` uses `:focus-visible` so that
 * a mouse click on a button does not leave it looking focused — the state the
 * inspector calls "focus" is the one a designer means.
 *
 * `disabled` is two selectors because form controls carry the real attribute while
 * everything else can only be marked, and the builder must style both the same way.
 */
const STATE_SUFFIXES: Record<StyleState, string[]> = {
  default: [''],
  hover: [':hover'],
  focus: [':focus-visible'],
  active: [':active'],
  disabled: [':disabled', '[data-disabled]'],
};

/** The class a node's rules are written against. Stable, so codegen can reuse it. */
export function nodeClassName(nodeId: string): string {
  return `ub-n-${nodeId}`;
}

function ruleText(className: string, state: StyleState, decls: StyleDecls, indent: string): string {
  const body = declarationsText(decls, `${indent}  `);
  if (body === '') return '';
  const selector = STATE_SUFFIXES[state]
    .map((suffix) => `${indent}.${className}${suffix}`)
    .join(',\n');
  return `${selector} {\n${body}\n${indent}}`;
}

function statesText(className: string, states: StyleSet[string], indent: string): string {
  const blocks: string[] = [];
  // 'default' first so the state variants that follow it win on source order alone,
  // without any of them needing extra specificity.
  for (const state of ['default', 'hover', 'focus', 'active', 'disabled'] as StyleState[]) {
    const decls = states[state];
    if (!decls) continue;
    const rule = ruleText(className, state, decls, indent);
    if (rule) blocks.push(rule);
  }
  return blocks.join('\n');
}

export interface SerializeOptions {
  /**
   * Drop every breakpoint wider than this one. The canvas sets it to the breakpoint
   * the inspector is editing, so what is on screen is that cell and the ones it
   * inherits from — never a wider override the panel is not showing.
   *
   * It only ever *narrows*. The media queries are still emitted, so a rule below the
   * artboard's width stays dormant exactly as it would in the browser: the canvas can
   * show less than the real page at that width, but never more.
   *
   * Preview and codegen leave it unset and get the whole stylesheet.
   */
  upTo?: string;
}

/**
 * Turns one node's styles into a class name and the CSS that backs it.
 *
 * Breakpoints are emitted mobile-first, ascending by `minWidth`, so a wider
 * breakpoint always overrides a narrower one by source order. `base` is the
 * unconditional rule and is emitted first regardless of whether the theme declares
 * it as a breakpoint.
 */
export function serializeNodeStyles(
  node: Node,
  theme: Theme,
  options: SerializeOptions = {},
): { className: string; css: string } {
  const className = nodeClassName(node.id);
  const blocks: string[] = [];

  const base = node.styles.base;
  if (base) {
    const text = statesText(className, base, '');
    if (text) blocks.push(text);
  }

  // An unknown id caps at base rather than lifting the cap: a document referring to a
  // breakpoint the theme dropped must not silently start showing every override.
  const ceiling =
    options.upTo === undefined
      ? Number.POSITIVE_INFINITY
      : (theme.breakpoints.find((breakpoint) => breakpoint.id === options.upTo)?.minWidth ?? 0);

  const responsive = [...theme.breakpoints]
    .filter((breakpoint) => breakpoint.id !== 'base' && breakpoint.minWidth > 0)
    .filter((breakpoint) => breakpoint.minWidth <= ceiling)
    .sort((a, b) => a.minWidth - b.minWidth);

  for (const breakpoint of responsive) {
    const states = node.styles[breakpoint.id];
    if (!states) continue;
    const text = statesText(className, states, '  ');
    if (text) blocks.push(`@media (min-width: ${breakpoint.minWidth}px) {\n${text}\n}`);
  }

  return { className, css: blocks.join('\n') };
}

/**
 * One node's `hover`/`focus`/`active`/`disabled` styles, forced on — the canvas's
 * preview of the state the inspector is editing (PLAN.md §9).
 *
 * The canvas swallows pointer events so the design stays inert, which means a hover
 * rule can never fire there: without this, the state switcher would let someone
 * author styles they cannot see. The rule doubles the node's own class to outrank the
 * plain one on specificity rather than reaching for `!important`, which would also
 * beat the state's real `:hover` rule and change what the canvas shows once the
 * preview is switched off.
 *
 * This is editor chrome. It is deliberately *not* part of `serializePageStyles`, so
 * neither the preview nor the export can inherit it — D6 is about the document's own
 * styles matching everywhere, not about editor affordances leaking into the output.
 */
export function serializeStatePreview(
  node: Node,
  theme: Theme,
  cell: { breakpoint: string; state: StyleState },
): string {
  if (cell.state === 'default') return '';

  const className = nodeClassName(node.id);
  const body = declarationsText(resolveDecls(node, theme, cell), '  ');
  if (body === '') return '';

  return `.${className}.${className} {\n${body}\n}`;
}

/** Every node's rules, in document order, as one stylesheet. */
export function serializePageStyles(
  nodes: Iterable<Node>,
  theme: Theme,
  options: SerializeOptions = {},
): string {
  const blocks: string[] = [];
  for (const node of nodes) {
    const { css } = serializeNodeStyles(node, theme, options);
    if (css) blocks.push(css);
  }
  return blocks.join('\n\n');
}

// A custom property may start with a digit — the space scale is named `1`, `2`, `4`
// after its steps, so `--space-4` is a name this has to let through.
const TOKEN_NAME = /^[a-z0-9][a-z0-9-]*$/i;

function tokenBlock(prefix: string, entries: Record<string, string>): string[] {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(entries)) {
    if (!TOKEN_NAME.test(name)) continue;
    const clean = sanitizeValue(value);
    if (clean === '') continue;
    lines.push(`  --${prefix}${name}: ${clean};`);
  }
  return lines;
}

/**
 * The theme as CSS custom properties on `:root`.
 *
 * Colours are emitted unprefixed (`--primary`, `--muted-foreground`) because that is
 * the vocabulary the component library and shadcn both already speak — a style value
 * of `var(--primary)` therefore means the same thing on the canvas, in the preview
 * and in exported code, with no resolution step anywhere in between.
 */
export function serializeTheme(theme: Theme): string {
  const lines = [
    ...tokenBlock('', theme.colors),
    ...tokenBlock('font-', theme.fonts),
    ...tokenBlock('space-', theme.space),
    ...tokenBlock('radius-', theme.radii),
  ];
  return `:root {\n${lines.join('\n')}\n}`;
}
