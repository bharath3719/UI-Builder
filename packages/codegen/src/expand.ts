/**
 * Emit templates -> JSX IR.
 *
 * This is the half of codegen that knows what a component looks like, and it knows it
 * only by reading the `emit` template on the spec (D7). Nothing here is written per
 * component; adding a component to the library adds nothing to this file.
 *
 * Every transform is a coercion from `@ui-builder/components` — literally the same
 * function the components call, not a copy of it, because the point of the templates is
 * that a node exports as what the canvas rendered. Where the export deliberately differs
 * from the canvas the difference lives in the template, not here: `Checkbox` writes
 * `defaultChecked` because a shipped checkbox should be tickable, and that decision is
 * legible in `specs/Checkbox.ts` rather than buried in a generator.
 *
 * Every answer now comes in two forms, and that is the whole of what Phase 11 changed
 * here. A prop the document holds statically is resolved while emitting, exactly as
 * before, and the branch that loses is never written. A *bound* prop cannot be, so its
 * coercion is written out as a call the page makes instead — `pick(state.tone, […], …)`
 * where a static prop would have produced the word. `values.ts` owns that spelling; the
 * templates themselves did not have to change shape, which is what §11 predicted.
 */

import {
  asBoolean,
  asEnum,
  asString,
  blockTag,
  initialsOf,
  inlineTag,
  parseOptions,
  parseRichText,
  parseTable,
  type EmitAttr,
  type EmitChild,
  type EmitCondition,
  type EmitElement,
  type EmitModule,
  type EmitTag,
  type EmitValue,
  type RichBlock,
  type RichInline,
} from '@ui-builder/components';
import { readProp, type Node } from '@ui-builder/schema';
import { element, stringLiteral, type JsxAttr, type JsxNode } from './ir.js';
import {
  classListCode,
  emitProp,
  enumCode,
  initialCode,
  initialsCode,
  numberCode,
  textCode,
  truthyCode,
  type Emitted,
  type Helpers,
} from './values.js';

/* -------------------------------------------------------------------------- */
/* Markdown -> JSX                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The `RichText` transform: the same tree the component renders, written as JSX.
 *
 * Elements rather than a string of HTML, so the exported page carries no Markdown
 * parser, nothing is injected as raw markup, and a diff of the generated file shows the
 * structure the author wrote. `blockTag`/`inlineTag` come from the parser's own module
 * so that this and the component cannot disagree about which element a block is.
 */
function inlineJsx(nodes: RichInline[]): JsxNode[] {
  return nodes.map((node) => {
    if (node.kind === 'text') return { kind: 'text', value: node.text };
    if (node.kind === 'code') {
      return element('code', [], [{ kind: 'text', value: node.text }]);
    }
    const attrs: JsxAttr[] =
      node.kind === 'link' ? [{ name: 'href', kind: 'string', value: node.href }] : [];
    return element(inlineTag(node), attrs, inlineJsx(node.children));
  });
}

function blockJsx(block: RichBlock): JsxNode {
  if (block.kind === 'rule') return element('hr');
  if (block.kind === 'code') {
    return element('pre', [], [element('code', [], [{ kind: 'text', value: block.text }])]);
  }
  if (block.kind === 'list') {
    return element(
      blockTag(block),
      [],
      block.items.map((item) => element('li', [], inlineJsx(item))),
    );
  }
  return element(blockTag(block), [], inlineJsx(block.children));
}

/* -------------------------------------------------------------------------- */
/* Table -> JSX                                                                */
/* -------------------------------------------------------------------------- */

/** Every element a table transform emits carries exactly one library class. */
function classed(value: string): JsxAttr {
  return { name: 'className', kind: 'string', value };
}

const SCOPE_COLUMN: JsxAttr = { name: 'scope', kind: 'string', value: 'col' };

/** What the head and body transforms have in common: where to read the grid from. */
interface TableFields {
  columns: string;
  rows: string;
  grip?: string;
}

/**
 * The head cannot be expanded without the body, because the width of a table is the widest
 * line in either field — see `parseTable`, which both halves of the render call.
 */
function tableFor(spec: TableFields, node: Node) {
  return parseTable(asString(readProp(node, spec.columns)), asString(readProp(node, spec.rows)));
}

function hasGrip(spec: TableFields, node: Node): boolean {
  return spec.grip !== undefined && asBoolean(readProp(node, spec.grip));
}

/* -------------------------------------------------------------------------- */
/* Resolving a template against a node                                         */
/* -------------------------------------------------------------------------- */

/** `undefined` means "omit this attribute entirely", which is not the same as empty. */
type Resolved = string | number | boolean | undefined;

/** A resolved value, or the code that produces one where the prop behind it is bound. */
type Value = { kind: 'static'; value: Resolved } | { kind: 'code'; code: string };

const NOTHING: Value = { kind: 'static', value: undefined };

function statically(value: Resolved): Value {
  return { kind: 'static', value };
}

/** A bound prop's evaluated value, or null when the prop holds something the generator knows. */
function boundCode(node: Node, prop: string, helpers: Helpers): string | null {
  const emitted: Emitted = emitProp(node.props[prop], helpers);
  return emitted.kind === 'code' ? emitted.code : null;
}

function resolveValue(value: EmitValue, context: ExpandContext): Value {
  if (typeof value === 'string') return statically(value);
  if ('const' in value) return statically(value.const);

  const { node, helpers } = context;
  const bound = boundCode(node, value.prop, helpers);

  if (bound !== null) {
    switch (value.as) {
      case 'string': {
        const text = textCode(bound, value.fallback ?? '', helpers);
        return {
          kind: 'code',
          code: value.orElse === undefined ? text : `${text} || ${stringLiteral(value.orElse)}`,
        };
      }
      case 'number':
        return {
          kind: 'code',
          code: numberCode(
            bound,
            value.fallback,
            {
              ...(value.round === undefined ? {} : { round: value.round }),
              ...(value.min === undefined ? {} : { min: value.min }),
            },
            helpers,
          ),
        };
      case 'enum':
        return { kind: 'code', code: enumCode(bound, value.options, value.fallback, helpers) };
      case 'boolean':
        return { kind: 'code', code: truthyCode(bound, value.default ?? false, helpers) };
      case 'flag': {
        // Present or absent, as in the static case — `undefined` is how React is told to
        // leave an attribute off, and the `:where([data-…])` rules are written against
        // presence rather than against a value.
        const on =
          value.equals === undefined
            ? truthyCode(bound, value.default ?? false, helpers)
            : `${textCode(bound, '', helpers)} === ${stringLiteral(value.equals)}`;
        return { kind: 'code', code: `${on} ? ${stringLiteral(value.on)} : undefined` };
      }
      case 'initials':
        return { kind: 'code', code: initialsCode(textCode(bound, '', helpers), helpers) };
      case 'initial': {
        const alternate = value.or === undefined ? NOTHING : resolveValue(value.or, context);
        const or =
          alternate.kind === 'code'
            ? alternate.code
            : alternate.value === undefined
              ? null
              : stringLiteral(String(alternate.value));
        return { kind: 'code', code: initialCode(textCode(bound, '', helpers), or, helpers) };
      }
    }
  }

  const raw = readProp(node, value.prop);

  switch (value.as) {
    case 'string': {
      const text = asString(raw, value.fallback ?? '');
      return statically(value.orElse !== undefined && text === '' ? value.orElse : text);
    }
    case 'number': {
      const number = typeof raw === 'number' && Number.isFinite(raw) ? raw : value.fallback;
      const shaped = value.round === false ? number : Math.round(number);
      return statically(value.min === undefined ? shaped : Math.max(value.min, shaped));
    }
    case 'enum':
      return statically(asEnum(raw, value.options, value.fallback));
    case 'boolean':
      return statically(asBoolean(raw, value.default));
    case 'flag': {
      const on =
        value.equals === undefined ? asBoolean(raw, value.default) : asString(raw) === value.equals;
      return statically(on ? value.on : undefined);
    }
    case 'initials':
      return statically(initialsOf(asString(raw)));
    case 'initial': {
      const author = asString(raw).trim();
      const alternate = value.or === undefined ? NOTHING : resolveValue(value.or, context);
      // A bound alternate cannot rescue a static first character that is already decided,
      // so it is the resolved one that is read here and the code path above that handles
      // the other order.
      const fallback = alternate.kind === 'static' ? String(alternate.value ?? '') : '';
      return statically(([...author][0] ?? [...fallback][0] ?? '?').toUpperCase());
    }
  }
}

/** A decided condition, or the code that decides it on the page. */
type Test = { kind: 'static'; value: boolean } | { kind: 'code'; code: string };

/**
 * `all` and `any` fold as far as they can before giving up and writing code: a group whose
 * static members already settle it never reaches the page, and one that does not drops the
 * members that were merely true. Without that, every `all` containing one bound prop would
 * emit the tests the generator had already answered.
 */
function foldGroup(parts: Test[], operator: '&&' | '||', absorbing: boolean): Test {
  if (parts.some((part) => part.kind === 'static' && part.value === absorbing)) {
    return { kind: 'static', value: absorbing };
  }

  const dynamic = parts.filter((part) => part.kind === 'code');
  if (dynamic.length === 0) return { kind: 'static', value: !absorbing };

  return { kind: 'code', code: dynamic.map((part) => part.code).join(` ${operator} `) };
}

function resolveCondition(condition: EmitCondition, context: ExpandContext): Test {
  if ('all' in condition) {
    return foldGroup(
      condition.all.map((each) => resolveCondition(each, context)),
      '&&',
      false,
    );
  }
  if ('any' in condition) {
    return foldGroup(
      condition.any.map((each) => resolveCondition(each, context)),
      '||',
      true,
    );
  }
  if ('not' in condition) {
    const inner = resolveCondition(condition.not, context);
    return inner.kind === 'static'
      ? { kind: 'static', value: !inner.value }
      : { kind: 'code', code: `!(${inner.code})` };
  }

  const { node, helpers } = context;
  const bound = boundCode(node, condition.prop, helpers);

  if (bound !== null) {
    switch (condition.when) {
      case 'set':
        return { kind: 'code', code: `${textCode(bound, '', helpers)} !== ''` };
      case 'unset':
        return { kind: 'code', code: `${textCode(bound, '', helpers)} === ''` };
      case 'true':
        return { kind: 'code', code: truthyCode(bound, condition.default ?? false, helpers) };
      case 'isNot':
        return {
          kind: 'code',
          code: `${enumCode(bound, condition.options, condition.fallback, helpers)} !== ${stringLiteral(condition.value)}`,
        };
    }
  }

  const raw = readProp(node, condition.prop);

  switch (condition.when) {
    case 'set':
      return { kind: 'static', value: asString(raw) !== '' };
    case 'unset':
      return { kind: 'static', value: asString(raw) === '' };
    case 'true':
      return { kind: 'static', value: asBoolean(raw, condition.default) };
    case 'isNot':
      return {
        kind: 'static',
        value: asEnum(raw, condition.options, condition.fallback) !== condition.value,
      };
  }
}

/**
 * The element name.
 *
 * A tag is the one thing that cannot become an expression. `<Tag />` where `Tag` holds
 * `'h2'` is legal React, but it needs a capitalised binding in scope, which would mean the
 * walker emitting a statement for what is meant to be an element — and a `Heading` whose
 * level is bound is a rare thing to want beside a real cost. So the fallback is emitted and
 * the export says out loud that it did, which is the same bargain `walkNode` strikes with a
 * component the library no longer has.
 */
function resolveTag(tag: EmitTag, context: ExpandContext): string {
  if (typeof tag === 'string') return tag;

  const { node } = context;
  if (node.props[tag.prop]?.kind === 'expr') {
    context.warnings.push(
      `"${node.name}" (${node.id}): the element depends on "${tag.prop}", which is bound to an expression — exported as ${tag.prefix ?? ''}${tag.fallback}.`,
    );
  }

  const value = asEnum(readProp(node, tag.prop), tag.options, tag.fallback);
  return `${tag.prefix ?? ''}${value}`;
}

/**
 * How a resolved value becomes an attribute.
 *
 * `true` prints bare and `false` from a coerced prop is dropped, because in React
 * `disabled={false}` and no `disabled` at all are the same DOM — so the shorter one is
 * the honest one. A literal `{ const: false }` is kept, since it is only ever written
 * where the value itself carries meaning: `draggable={false}` is a real instruction,
 * and omitting it would leave the attribute at `auto`.
 */
function toAttr(name: string, value: Value, literal: boolean): JsxAttr | null {
  // A bound value is written as it stands. `undefined` at run time omits the attribute
  // just as `null` here does, and `false` omits it too — which is React's own rule and
  // therefore already the rule the static side is written against.
  if (value.kind === 'code') return { name, kind: 'expr', code: value.code };

  const resolved = value.value;
  if (resolved === undefined) return null;
  if (typeof resolved === 'boolean') {
    if (resolved) return { name, kind: 'bare' };
    return literal ? { name, kind: 'expr', code: 'false' } : null;
  }
  if (typeof resolved === 'number') return { name, kind: 'expr', code: String(resolved) };
  return { name, kind: 'string', value: resolved };
}

function isConditional(attr: EmitAttr): attr is { when: EmitCondition; value: EmitValue } {
  return typeof attr === 'object' && 'when' in attr && 'value' in attr;
}

export interface ExpandContext {
  node: Node;
  /**
   * The expression carrying the node's own styles — `styles['ub-n-abc']` — or null when
   * the node has no rules, in which case referencing it would put `undefined` into the
   * class list.
   */
  styleExpr: string | null;
  /** The node's already-emitted children, dropped wherever the template says `slot`. */
  children: JsxNode[];
  /**
   * Modules the page has to import because a template reached for one, collected as the
   * walk goes: a page cannot know what it imports until it knows what is on it, and the
   * same module is reached for by every node of that type.
   */
  modules: Set<EmitModule>;
  /** The value helpers a bound prop made the page reach for. See `values.ts`. */
  helpers: Helpers;
  /** What the export could not carry, said out loud rather than dropped silently. */
  warnings: string[];
  /**
   * An extra class expression for the *root* element only — `props.className` inside a
   * generated symbol component, and undefined everywhere else.
   *
   * It is what makes an instance stylable without a wrapper element: the placement's own
   * rules land on the element the symbol's root already renders. See `classAttr`.
   */
  rootExtraClass?: string;
}

/**
 * The `className` for an element.
 *
 * The library class is global (it comes from `css.ts`, shipped verbatim) while the
 * node's class is a CSS Module one, so the two are combined in a template literal
 * rather than a string. Only the root element gets the node's class, matching the
 * runtime, where `className` lands on whatever the component spreads it onto.
 */
function classAttr(
  libraryClass: string | undefined,
  styleExpr: string | null,
  context: ExpandContext,
  root: boolean,
): JsxAttr | null {
  // The one case where a class is contributed from outside the file: this is a symbol's
  // root, and its caller's `className` is the styling of that one placement. It has to come
  // last — both weigh a class, so source order decides, and an override written on an
  // instance must beat the component's own rule (the runtime stacks them the same way).
  const extra = root ? context.rootExtraClass : undefined;
  if (extra) {
    const parts = [
      ...(libraryClass ? [stringLiteral(libraryClass)] : []),
      ...(styleExpr ? [styleExpr] : []),
      extra,
    ];
    return { name: 'className', kind: 'expr', code: classListCode(parts, context.helpers) };
  }

  if (libraryClass && styleExpr) {
    return { name: 'className', kind: 'expr', code: `\`${libraryClass} \${${styleExpr}}\`` };
  }
  if (libraryClass) return { name: 'className', kind: 'string', value: libraryClass };
  if (styleExpr) return { name: 'className', kind: 'expr', code: styleExpr };
  return null;
}

/**
 * The named transforms are the one thing a binding cannot reach.
 *
 * They exist because the *shape* of what they emit depends on what was typed — one
 * `<option>` per line, one `<tr>` per row, whatever headings the Markdown described — and
 * a static template cannot say that (`emit.ts`). Making them dynamic means shipping their
 * parser into the export and a component to render its output, which for `RichText` is the
 * Markdown parser §7 says an export never carries, and for the rest is markup written a
 * second time in a place that could drift from the template.
 *
 * So a bound source prop expands as if the field were empty, and says so. The alternative
 * — a silently empty `<select>` in a project that ran fine on the canvas — is the failure
 * this codebase spends its warnings on avoiding.
 */
function staticOnly(
  context: ExpandContext,
  transform: string,
  props: (string | undefined)[],
): void {
  const bound = props.filter(
    (prop): prop is string => prop !== undefined && context.node.props[prop]?.kind === 'expr',
  );
  if (bound.length === 0) return;

  const { node } = context;
  const named = bound.map((prop) => `"${prop}"`).join(', ');
  context.warnings.push(
    `"${node.name}" (${node.id}): ${transform} is built from ${named}, which ${bound.length === 1 ? 'is' : 'are'} bound to an expression — exported empty, because the markup's shape depends on the text.`,
  );
}

/** Children are never the root, so none of them carry the node's own style class. */
function expandChild(child: EmitChild, context: ExpandContext): JsxNode[] {
  if ('slot' in child) return context.children;

  if ('text' in child) {
    const value = resolveValue(child.text, context);
    if (value.kind === 'code') return [{ kind: 'expr', code: value.code }];
    // An empty run of text is nothing at all, not an empty JSX expression.
    if (value.value === undefined || value.value === '') return [];
    return [{ kind: 'text', value: String(value.value) }];
  }

  if ('options' in child) {
    staticOnly(context, 'the option list', [child.options.prop]);
    return parseOptions(asString(readProp(context.node, child.options.prop))).map((option) =>
      element(
        'option',
        [{ name: 'value', kind: 'string', value: option.value }],
        [{ kind: 'text', value: option.label }],
      ),
    );
  }

  if ('radios' in child) {
    const { node } = context;
    const spec = child.radios;
    staticOnly(context, 'the radio group', [spec.options, spec.name, spec.checked, spec.disabled]);
    const group = asString(readProp(node, spec.name), 'choice');
    const selected = asString(readProp(node, spec.checked));
    const disabled = asBoolean(readProp(node, spec.disabled));

    return parseOptions(asString(readProp(node, spec.options))).map((option) => {
      const attrs: JsxAttr[] = [
        { name: 'type', kind: 'string', value: 'radio' },
        { name: 'className', kind: 'string', value: 'ub-radio-input' },
        { name: 'name', kind: 'string', value: group },
        { name: 'value', kind: 'string', value: option.value },
      ];
      // `defaultChecked`, matching Checkbox: the document says where the shipped group
      // starts, not what it is pinned to.
      if (option.value === selected) attrs.push({ name: 'defaultChecked', kind: 'bare' });
      if (disabled) attrs.push({ name: 'disabled', kind: 'bare' });

      return element(
        'label',
        [{ name: 'className', kind: 'string', value: 'ub-radio' }],
        [
          element('input', attrs),
          element(
            'span',
            [{ name: 'className', kind: 'string', value: 'ub-radio-label' }],
            [{ kind: 'text', value: option.label }],
          ),
        ],
      );
    });
  }

  if ('navItems' in child) {
    const { node } = context;
    const spec = child.navItems;
    staticOnly(context, 'the link row', [spec.items, spec.active]);
    // `null`, not '', when the component has no current item: an option line of ' | Home'
    // parses to an empty value, and an empty string would then mark it as the page.
    const current = spec.active === undefined ? null : asString(readProp(node, spec.active));

    return parseOptions(asString(readProp(node, spec.items))).map((item) => {
      const attrs: JsxAttr[] = [
        { name: 'className', kind: 'string', value: spec.class },
        { name: 'href', kind: 'string', value: item.value },
      ];
      // Present or absent, never `data-active="false"` — the `:where([data-active])`
      // rule in `css.ts` is written against presence, exactly as the `flag` values are.
      if (item.value === current) {
        attrs.push({ name: 'data-active', kind: 'string', value: '' });
        attrs.push({ name: 'aria-current', kind: 'string', value: 'page' });
      }

      return element('a', attrs, [{ kind: 'text', value: item.label }]);
    });
  }

  if ('tableHead' in child) {
    const { node } = context;
    const spec = child.tableHead;
    staticOnly(context, 'the table head', [spec.columns, spec.rows, spec.grip]);
    const data = tableFor(spec, node);
    const cells: JsxNode[] = [];

    if (hasGrip(spec, node)) {
      cells.push(element('th', [classed('ub-table-grip-cell'), SCOPE_COLUMN]));
    }
    for (const heading of data.headers) {
      // An empty heading is an empty cell, not a `{''}` — the same rule the `text` child
      // follows, and the same DOM the component produces for it.
      cells.push(
        element(
          'th',
          [classed('ub-table-header'), SCOPE_COLUMN],
          heading === '' ? [] : [{ kind: 'text', value: heading }],
        ),
      );
    }

    return cells;
  }

  if ('tableRows' in child) {
    const { node } = context;
    const spec = child.tableRows;
    staticOnly(context, 'the table body', [spec.columns, spec.rows, spec.grip, spec.empty]);
    const data = tableFor(spec, node);
    const grip = hasGrip(spec, node);

    if (data.rows.length === 0) {
      const empty = spec.empty === undefined ? '' : asString(readProp(node, spec.empty));
      if (empty === '') return [];
      return [
        element(
          'tr',
          [classed('ub-table-row')],
          [
            element(
              'td',
              [
                classed('ub-table-empty'),
                // Never zero: a table with neither columns nor rows still has to span
                // something, and `colSpan={0}` means "to the end of the group" in HTML
                // and nothing at all in some browsers.
                {
                  name: 'colSpan',
                  kind: 'expr',
                  code: String(Math.max(1, data.width + (grip ? 1 : 0))),
                },
              ],
              [{ kind: 'text', value: empty }],
            ),
          ],
        ),
      ];
    }

    return data.rows.map((cells) =>
      element(
        'tr',
        [classed('ub-table-row')],
        [
          ...(grip
            ? [
                element(
                  'td',
                  [classed('ub-table-grip-cell')],
                  [
                    element('button', [
                      { name: 'type', kind: 'string', value: 'button' },
                      classed('ub-table-grip'),
                      // What `SortableRows` looks for. It is the only thing that component
                      // assumes about the markup it is handed, so it is spelled here.
                      { name: 'data-grip', kind: 'string', value: '' },
                      { name: 'aria-label', kind: 'string', value: 'Reorder row' },
                    ]),
                  ],
                ),
              ]
            : []),
          ...cells.map((cell) =>
            element(
              'td',
              [classed('ub-table-cell')],
              cell === '' ? [] : [{ kind: 'text', value: cell }],
            ),
          ),
        ],
      ),
    );
  }

  if ('markdown' in child) {
    staticOnly(context, 'the formatted copy', [child.markdown.prop]);
    const source = asString(
      readProp(context.node, child.markdown.prop),
      child.markdown.fallback ?? '',
    );
    return parseRichText(source).map(blockJsx);
  }

  const expanded = expandElement(child, context);
  return expanded ? [expanded] : [];
}

/**
 * One template element to one JSX element, or null when its condition says it is not
 * part of this node's rendering.
 */
export function expandElement(
  template: EmitElement,
  context: ExpandContext,
  root = false,
): JsxNode | null {
  const present = template.when ? resolveCondition(template.when, context) : null;
  if (present?.kind === 'static' && !present.value) return null;

  const attrs: JsxAttr[] = [];

  const className = classAttr(template.class, root ? context.styleExpr : null, context, root);
  if (className) attrs.push(className);

  for (const [name, attr] of Object.entries(template.attrs ?? {})) {
    if (isConditional(attr)) {
      const test = resolveCondition(attr.when, context);
      if (test.kind === 'static' && !test.value) continue;

      const value = resolveValue(attr.value, context);
      if (test.kind === 'static') {
        const resolved = toAttr(name, value, false);
        if (resolved) attrs.push(resolved);
        continue;
      }

      // The condition is only known on the page, so the *attribute* becomes a ternary
      // rather than the element becoming two. `undefined` is how the false arm says the
      // attribute is not there at all, which is what the static branch above does by
      // never pushing it.
      const present =
        value.kind === 'code'
          ? value.code
          : value.value === undefined
            ? 'undefined'
            : typeof value.value === 'string'
              ? stringLiteral(value.value)
              : String(value.value);
      attrs.push({ name, kind: 'expr', code: `${test.code} ? ${present} : undefined` });
      continue;
    }

    const literal = typeof attr === 'object' && 'const' in attr;
    const resolved = toAttr(name, resolveValue(attr, context), literal);
    if (resolved) attrs.push(resolved);
  }

  const children = (template.children ?? []).flatMap((child) => expandChild(child, context));

  // `from` wins over `tag`, and does not contradict it: `tag` says what the element is —
  // a `SortableRows` is a `tbody` — and the module says what writes it.
  let node: JsxNode;
  if (template.from) {
    context.modules.add(template.from);
    node = element(template.from.name, attrs, children);
  } else {
    node = element(resolveTag(template.tag, context), attrs, children);
  }

  return present?.kind === 'code' ? { kind: 'when', test: present.code, child: node } : node;
}
