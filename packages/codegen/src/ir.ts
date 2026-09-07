/**
 * The JSX intermediate representation and its printer — PLAN.md §11.
 *
 * Codegen builds this tree and then prints it, rather than concatenating strings as it
 * walks the document. The reason is not tidiness: an element cannot decide whether it
 * fits on one line until its attributes and children are known, and `repeat` -> `.map()`
 * and conditional rendering in Phase 11 are transformations *of a tree*. Doing it in one
 * pass over strings would make all three of those a rewrite.
 *
 * The printer's output is what a developer opens, so it is formatted here rather than
 * handed to Prettier: the emitter knows the structure and can break lines on it, which
 * keeps `generateProject` synchronous and dependency-free — the same function then runs
 * in the studio's code panel, in the API's zip route and in a snapshot test with no
 * bundled formatter and no version of one to drift.
 */

/** Matches the repo's own Prettier setting, so generated files read like written ones. */
const PRINT_WIDTH = 100;
const INDENT = '  ';

export type JsxAttr =
  | { name: string; kind: 'string'; value: string }
  /** `rows={2}`, `draggable={false}`, `` className={`a ${b}`} `` — printed verbatim. */
  | { name: string; kind: 'expr'; code: string }
  /** `disabled` — JSX shorthand for `={true}`. */
  | { name: string; kind: 'bare' };

export interface JsxElement {
  kind: 'element';
  tag: string;
  attrs: JsxAttr[];
  children: JsxNode[];
}

/**
 * A node the document renders conditionally or repeatedly — `showIf` and `repeat`.
 *
 * They are IR nodes rather than strings assembled by the walker for the reason the module
 * note gives: both are transformations *of a tree*, and an element cannot know whether it
 * fits on one line until whatever wraps it is known too. `test` is already a boolean —
 * `truthy(...)` — because `0 && <div />` renders a nought, which is the classic way a
 * conditional in React shows the wrong thing rather than nothing.
 */
export type JsxNode =
  | JsxElement
  | { kind: 'text'; value: string }
  | { kind: 'expr'; code: string }
  | { kind: 'fragment'; children: JsxNode[] }
  | { kind: 'when'; test: string; child: JsxNode }
  /**
   * `statements` are the handlers of nodes inside this repeat, which cannot be hoisted
   * past it: they close over the `item` this copy was rendered for, and that is exactly
   * how "remove this row" knows which row. An empty list keeps the concise arrow form.
   */
  | { kind: 'map'; over: string; params: string; statements: string[]; child: JsxNode };

export function element(tag: string, attrs: JsxAttr[] = [], children: JsxNode[] = []): JsxElement {
  return { kind: 'element', tag, attrs, children };
}

/* -------------------------------------------------------------------------- */
/* Literals                                                                    */
/* -------------------------------------------------------------------------- */

const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;

/**
 * A single-quoted JS string, matching the repo's Prettier config.
 *
 * Control characters are escaped rather than passed through: a document can carry
 * whatever a textarea accepts, and a raw newline inside a string literal is a syntax
 * error in the file someone is about to run. The two Unicode separators are escaped for
 * the same reason — legal in a JS string today, still capable of confusing tooling that
 * treats them as line terminators.
 */
export function stringLiteral(value: string): string {
  let body = '';
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (character === '\\') body += '\\\\';
    else if (character === "'") body += "\\'";
    else if (character === '\n') body += '\\n';
    else if (character === '\r') body += '\\r';
    else if (character === '\t') body += '\\t';
    else if (
      code < 0x20 ||
      code === 0x7f ||
      code === LINE_SEPARATOR ||
      code === PARAGRAPH_SEPARATOR
    )
      body += `\\u${code.toString(16).padStart(4, '0')}`;
    else body += character;
  }
  return `'${body}'`;
}

/**
 * JSX text is not plain text: `<`, `>`, `{` and `}` are syntax, `&` starts an entity,
 * and leading, trailing or repeated whitespace is collapsed away. Text that would
 * survive that trip unchanged is written literally, because that is what a developer
 * wants to read; everything else becomes a string expression, which has none of those
 * rules and therefore reproduces the document exactly.
 */
function textNode(value: string): string {
  const survives =
    /^[^{}<>&\n\r\t]*$/.test(value) && value === value.trim() && !value.includes('  ');
  return survives ? value : `{${stringLiteral(value)}}`;
}

/* -------------------------------------------------------------------------- */
/* Printing                                                                    */
/* -------------------------------------------------------------------------- */

function attrText(attr: JsxAttr): string {
  if (attr.kind === 'bare') return attr.name;
  if (attr.kind === 'expr') return `${attr.name}={${attr.code}}`;
  // A double-quoted JSX attribute cannot hold a double quote, and escaping is not
  // something JSX attribute strings do — so a value carrying one becomes an expression.
  return attr.value.includes('"')
    ? `${attr.name}={${stringLiteral(attr.value)}}`
    : `${attr.name}="${attr.value}"`;
}

/** Re-indents an already-formatted block of statements to sit `depth` levels in. */
function indented(lines: string[], depth: number): string[] {
  const pad = INDENT.repeat(depth);
  return lines.flatMap((block) => block.split('\n').map((line) => (line === '' ? '' : pad + line)));
}

function printNode(node: JsxNode, depth: number): string[] {
  const pad = INDENT.repeat(depth);

  if (node.kind === 'text') return [pad + textNode(node.value)];
  if (node.kind === 'expr') return [`${pad}{${node.code}}`];

  if (node.kind === 'fragment') {
    // A fragment exists to hold something beside the page — the toast host — so it is
    // never worth collapsing onto one line.
    return [
      `${pad}<>`,
      ...node.children.flatMap((child) => printNode(child, depth + 1)),
      `${pad}</>`,
    ];
  }

  if (node.kind === 'when') {
    const inner = printNode(node.child, 0);
    const line = `${pad}{${node.test} && ${inner.join('\n')}}`;
    if (inner.length === 1 && line.length <= PRINT_WIDTH) return [line];

    return [`${pad}{${node.test} && (`, ...printNode(node.child, depth + 1), `${pad})}`];
  }

  if (node.kind === 'map') {
    const head = `${pad}{${node.over}.map(${node.params} => `;

    if (node.statements.length === 0) {
      // Two parens open here — the `.map(` call and the arrow's parenthesised body — so
      // two have to close. The branch below closes the call with `})}` for the same
      // reason, which is why only this one could be one short.
      return [`${head}(`, ...printNode(node.child, depth + 1), `${pad}))}`];
    }

    return [
      `${head}{`,
      ...indented(node.statements, depth + 1),
      '',
      `${pad}${INDENT}return (`,
      ...printNode(node.child, depth + 2),
      `${pad}${INDENT});`,
      `${pad}})}`,
    ];
  }

  const attrs = node.attrs.map(attrText);
  const open = attrs.length === 0 ? `<${node.tag}` : `<${node.tag} ${attrs.join(' ')}`;
  const fits = pad.length + open.length <= PRINT_WIDTH;

  if (node.children.length === 0) {
    if (pad.length + open.length + 3 <= PRINT_WIDTH) return [`${pad}${open} />`];
    return [`${pad}<${node.tag}`, ...attrs.map((attr) => pad + INDENT + attr), `${pad}/>`];
  }

  // One short text child stays on the element's own line — `<p ...>Text</p>` — which is
  // most of a generated page, and reads far better than the exploded form.
  const only = node.children.length === 1 ? node.children[0] : undefined;
  if (fits && only && only.kind !== 'element') {
    const inner = printNode(only, 0)[0]!;
    const line = `${pad}${open}>${inner}</${node.tag}>`;
    if (line.length <= PRINT_WIDTH) return [line];
  }

  const body = node.children.flatMap((child) => printNode(child, depth + 1));

  if (fits) return [`${pad}${open}>`, ...body, `${pad}</${node.tag}>`];

  return [
    `${pad}<${node.tag}`,
    ...attrs.map((attr) => pad + INDENT + attr),
    `${pad}>`,
    ...body,
    `${pad}</${node.tag}>`,
  ];
}

/** Prints a tree as JSX, indented `depth` levels in. */
export function printJsx(node: JsxNode, depth = 0): string {
  return printNode(node, depth).join('\n');
}
