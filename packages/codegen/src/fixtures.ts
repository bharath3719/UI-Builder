/**
 * Documents the snapshot tests generate from.
 *
 * Deliberately not a pretty page: the fixture's job is to hit the cases that break a
 * code generator — an element whose tag comes from a prop, a component that renders one
 * of two subtrees, a list authored as text, a label that disappears when empty, text
 * carrying characters JSX treats as syntax, a hidden node, a node whose component no
 * longer exists, and styles across a breakpoint and a pseudo-state.
 *
 * Node ids are written by hand rather than generated. They end up in class names and in
 * every snapshot, so a random one would make the snapshots change on every run and
 * assert nothing.
 */

import {
  DEFAULT_THEME,
  DOC_SCHEMA_VERSION,
  exprProp,
  makeNode,
  makePage,
  makeSymbol,
  staticProp,
  type ActionStep,
  type Json,
  type Node,
  type Page,
  type ProjectDoc,
  type QueryDef,
  type StateVar,
  type StyleSet,
  type SymbolDef,
  type SymbolProp,
} from '@ui-builder/schema';

interface NodeInit {
  id: string;
  type: string;
  name?: string;
  children?: string[];
  props?: Record<string, Json>;
  /** Props bound to an expression, written as the template source the inspector stores. */
  bound?: Record<string, string>;
  styles?: StyleSet;
  hidden?: boolean;
  events?: Record<string, ActionStep[]>;
  /** Template source for the node's `repeat` and `showIf`. */
  repeat?: string;
  showIf?: string;
  /** A `showIf` the document already answers, which the generator resolves rather than emits. */
  showIfStatic?: Json;
}

function node(init: NodeInit, parentId: string | null): Node {
  return makeNode({
    id: init.id,
    parentId,
    type: init.type,
    name: init.name ?? init.type,
    children: init.children ?? [],
    props: {
      ...Object.fromEntries(
        Object.entries(init.props ?? {}).map(([name, value]) => [name, staticProp(value)]),
      ),
      ...Object.fromEntries(
        Object.entries(init.bound ?? {}).map(([name, code]) => [name, exprProp(code)]),
      ),
    },
    styles: init.styles ?? {},
    ...(init.hidden === undefined ? {} : { hidden: init.hidden }),
    ...(init.events === undefined ? {} : { events: init.events }),
    ...(init.repeat === undefined ? {} : { repeat: { over: exprProp(init.repeat) } }),
    ...(init.showIf === undefined ? {} : { showIf: exprProp(init.showIf) }),
    ...(init.showIfStatic === undefined ? {} : { showIf: staticProp(init.showIfStatic) }),
  });
}

interface PageInit {
  state?: StateVar[];
  queries?: QueryDef[];
}

function page(
  id: string,
  name: string,
  path: string,
  rootId: string,
  inits: NodeInit[],
  extra: PageInit = {},
): Page {
  const parentOf = new Map<string, string>();
  for (const init of inits) {
    for (const child of init.children ?? []) parentOf.set(child, init.id);
  }

  const nodes: Record<string, Node> = {};
  for (const init of inits) nodes[init.id] = node(init, parentOf.get(init.id) ?? null);

  return makePage({ id, name, path, rootId, nodes, ...extra });
}

/**
 * The real default theme, not a cut-down one.
 *
 * A partial token set makes the *generator* look fine and the exported page look broken
 * — `color: var(--primary-foreground)` with no such token is a button with invisible
 * text — so the fixture uses what a real document carries. It is also what makes
 * `theme.css` in the snapshot worth reading.
 */
const THEME = DEFAULT_THEME;

/** Every branch the templates can take, on one page. */
export function demoDoc(): ProjectDoc {
  const home = page('pg-home', 'Home', '/', 'root', [
    {
      id: 'root',
      type: 'Box',
      name: 'Page',
      children: ['title', 'lede', 'row', 'prose', 'roster', 'hidden', 'gone'],
      styles: {
        base: {
          default: { minHeight: '100%', padding: 32, display: 'flex', flexDirection: 'column' },
        },
        md: { default: { padding: 64 } },
      },
    },
    { id: 'title', type: 'Heading', props: { text: 'Ship it', level: '1' } },
    {
      id: 'lede',
      type: 'Text',
      // `<`, `&` and a brace are all JSX syntax; the printer has to route this through
      // a string expression rather than write it as text.
      props: { text: 'Costs < $5 & takes {one} minute', tone: 'muted' },
      styles: { base: { default: { maxWidth: 560 } } },
    },
    {
      id: 'row',
      type: 'HStack',
      children: [
        'cta',
        'link',
        'avatar-img',
        'avatar-initials',
        'pick',
        'agree',
        'toggle',
        'bare-toggle',
        'choose',
        'level',
        'when',
        'msg',
        'typing',
      ],
      props: { gap: '2', align: 'center', wrap: true },
    },
    {
      id: 'cta',
      type: 'Button',
      props: { text: 'Get started', variant: 'default', size: 'lg' },
      styles: {
        base: { default: { fontWeight: 600 }, hover: { transform: 'translateY(-1px)' } },
      },
    },
    {
      id: 'link',
      type: 'Link',
      props: { text: 'Docs', href: 'https://example.com', target: 'blank' },
    },
    { id: 'avatar-img', type: 'Avatar', props: { src: 'https://example.com/a.png', alt: 'Ada' } },
    { id: 'avatar-initials', type: 'Avatar', props: { fallback: 'Ada Lovelace' } },
    {
      id: 'pick',
      type: 'Select',
      props: { options: 'one | One\ntwo | Two\nthree', placeholder: 'Choose', value: '' },
    },
    { id: 'agree', type: 'Checkbox', props: { label: 'Accept terms', checked: true } },
    { id: 'toggle', type: 'Switch', props: { label: 'Notifications', checked: true } },
    // No label — the span must not be emitted at all.
    { id: 'bare-toggle', type: 'Switch', props: { label: '' } },
    {
      id: 'msg',
      type: 'ChatMessage',
      props: { role: 'user', author: 'Ada', text: 'Line one\nLine two', showAvatar: true },
    },
    { id: 'typing', type: 'TypingIndicator', props: { label: 'Thinking…', bubble: true } },
    // One option checked and one group disabled, so the per-option attributes are
    // covered in both states by a single node.
    {
      id: 'choose',
      type: 'Radio',
      props: {
        options: 'card | Card\nbank | Bank transfer\ncrypto',
        value: 'bank',
        name: 'payment',
        orientation: 'horizontal',
        disabled: true,
      },
    },
    // A fractional step, which is the case `round: false` exists for: rounded here it
    // would export as 1 while the canvas rendered 0.25.
    { id: 'level', type: 'Slider', props: { value: 0.5, min: 0, max: 1, step: 0.25 } },
    // Bounds set, so the conditional min/max attributes are emitted rather than skipped.
    {
      id: 'when',
      type: 'DatePicker',
      props: { kind: 'date', value: '2026-01-31', min: '2026-01-01', max: '2026-12-31' },
    },
    // Every block the parser produces, plus the two cases worth pinning: a refused
    // `javascript:` href must come out as the words alone, and a fence must survive
    // characters that are JSX syntax.
    {
      id: 'prose',
      type: 'RichText',
      props: {
        content: [
          '## What you get',
          '',
          'A **real** parser, not `dangerouslySetInnerHTML`. Read the [docs](/docs) or',
          '[the unsafe one](javascript:alert(1)).',
          '',
          '- Headings and lists',
          '1. Ordered too',
          '',
          '> Quoted, *with emphasis*.',
          '',
          '---',
          '',
          '```ts',
          'const x = { a: 1 } as const;',
          '```',
        ].join('\n'),
      },
      styles: { base: { default: { maxWidth: 640 } } },
    },
    // The only component that exports as an imported *component* rather than as markup,
    // and therefore the only thing that writes a file into `src/components` — a path the
    // snapshot cannot cover from anywhere else. The short second row is the padding case:
    // the table is as wide as its longest line, and no `<tr>` is left missing a `<td>`.
    {
      id: 'roster',
      type: 'Table',
      props: {
        caption: 'Who is on the project',
        columns: 'Name | Role',
        rows: 'Ada Lovelace | Owner\nGrace Hopper | Editor | Away',
        reorderable: true,
        striped: true,
        bordered: false,
        compact: false,
        emptyText: 'No rows yet.',
      },
      styles: { base: { default: { maxWidth: 640 } } },
    },
    { id: 'hidden', type: 'Text', props: { text: 'Not in the export' }, hidden: true },
    { id: 'gone', type: 'Carousel', name: 'Old carousel' },
  ]);

  const about = page('pg-about', 'About us', '/about', 'about', [
    { id: 'about', type: 'VStack', children: ['about-text'], props: { gap: '4' } },
    { id: 'about-text', type: 'Text', props: { text: 'A small team.' } },
  ]);

  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: 'doc-demo',
    name: 'Demo Project',
    pages: [home, about],
    symbols: [],
    theme: THEME,
  };
}

/**
 * Phase 11's acceptance criterion, written as a document — PLAN.md §12.
 *
 * A counter button, a text field bound to a variable, and a list rendered from a real
 * request. Everything else on it is there because it is a shape the generator has to get
 * right and nothing else covers: a bound enum and a bound boolean (which become coercion
 * calls rather than words), a heading that reads a variable *and* literal text in one
 * field (a template literal rather than a bare expression), a node that repeats over a
 * query's rows with a handler *inside* the repeat (which cannot be hoisted past it), a
 * `showIf`, a query whose URL interpolates state, a toast, and a navigation.
 *
 * Kept apart from `demoDoc` on purpose. That fixture's snapshot is the proof that a
 * document with no interactions exports byte-for-byte as it did before this phase.
 */
export function interactiveDoc(): ProjectDoc {
  const state: StateVar[] = [
    { id: 'sv-count', name: 'count', type: 'number', initial: 0 },
    { id: 'sv-search', name: 'search', type: 'string', initial: '' },
    { id: 'sv-busy', name: 'busy', type: 'boolean', initial: false },
  ];

  const queries: QueryDef[] = [
    {
      id: 'q-people',
      name: 'people',
      method: 'GET',
      url: 'https://example.com/api/people?q={{ state.search }}',
      headers: { Accept: 'application/json' },
      runOnLoad: true,
    },
    {
      id: 'q-save',
      name: 'save',
      method: 'POST',
      url: 'https://example.com/api/visits',
      body: '{"seen": {{ state.count }}}',
      runOnLoad: false,
    },
  ];

  const home = page(
    'pg-home',
    'Home',
    '/',
    'root',
    [
      {
        id: 'root',
        type: 'VStack',
        name: 'Page',
        children: ['heading', 'field', 'counter', 'empty', 'people', 'away'],
        props: { gap: '4' },
        styles: { base: { default: { padding: 32, minHeight: '100%' } } },
      },
      // Mixed content: literal text either side of a hole, so this is a template literal
      // and the number is stringified rather than the whole thing being one expression.
      {
        id: 'heading',
        type: 'Heading',
        name: 'Title',
        props: { level: '1' },
        bound: { text: 'Seen {{ state.count }} times' },
      },
      // The input half of the criterion: typing writes the variable, the query below reads
      // it, and the list re-fetches. The field itself is uncontrolled — `Input` has no
      // `value` prop, so it starts empty on the canvas, in the preview and here alike.
      {
        id: 'field',
        type: 'Input',
        name: 'Search',
        props: { placeholder: 'Search people' },
        bound: { disabled: '{{ state.busy }}' },
        events: {
          onChange: [
            { kind: 'setState', stateId: 'sv-search', value: exprProp('{{ event.target.value }}') },
          ],
        },
      },
      // The counter half. Three steps, so the ordering and the `await` are both covered,
      // and a bound `variant` so an enum coercion reaches the output.
      {
        id: 'counter',
        type: 'Button',
        name: 'Count up',
        props: { text: 'Count up', size: 'lg' },
        bound: { variant: "{{ state.busy ? 'secondary' : 'default' }}" },
        events: {
          onClick: [
            { kind: 'setState', stateId: 'sv-count', value: exprProp('{{ state.count + 1 }}') },
            { kind: 'toggleState', stateId: 'sv-busy' },
            { kind: 'runQuery', queryId: 'q-save' },
            { kind: 'showToast', message: exprProp('Counted to {{ state.count + 1 }}') },
          ],
        },
      },
      // Shown only while there is nothing to show: `truthy` has to treat an empty array as
      // empty, which plain JavaScript does not.
      {
        id: 'empty',
        type: 'Text',
        name: 'Nothing yet',
        props: { text: 'No people yet.', tone: 'muted' },
        showIf: '{{ !queries.people.data }}',
      },
      // The list half. The handler inside it reads `item`, which is what makes hoisting it
      // out of the callback wrong.
      {
        id: 'people',
        type: 'Card',
        name: 'Person',
        children: ['person-name', 'person-open'],
        repeat: '{{ queries.people.data }}',
      },
      { id: 'person-name', type: 'Text', name: 'Name', bound: { text: '{{ item.name }}' } },
      {
        id: 'person-open',
        type: 'Button',
        name: 'Open',
        props: { text: 'Open', variant: 'outline' },
        events: {
          onClick: [{ kind: 'navigate', to: exprProp('/people/{{ item.id }}') }],
        },
      },
      // A static condition on a static prop still resolves at generation time, so this
      // node is simply absent from the output rather than wrapped in `false &&`.
      {
        id: 'away',
        type: 'Text',
        name: 'Never',
        props: { text: 'Unreachable' },
        showIfStatic: false,
      },
    ],
    { state, queries },
  );

  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: 'doc-interactive',
    name: 'Interactive Demo',
    pages: [home],
    symbols: [],
    theme: THEME,
  };
}

/** The narrowest real document: one unstyled node, so no CSS module is written. */
export function bareDoc(): ProjectDoc {
  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: 'doc-bare',
    name: 'Bare',
    pages: [page('pg', 'Home', '/', 'n', [{ id: 'n', type: 'Box' }])],
    symbols: [],
    theme: THEME,
  };
}

/* -------------------------------------------------------------------------- */
/* Symbols — PLAN.md §12                                                       */
/* -------------------------------------------------------------------------- */

interface SymbolInit {
  id: string;
  name: string;
  rootId: string;
  props?: SymbolProp[];
  nodes: NodeInit[];
}

function symbol(init: SymbolInit): SymbolDef {
  const parentOf = new Map<string, string>();
  for (const each of init.nodes) {
    for (const child of each.children ?? []) parentOf.set(child, each.id);
  }

  const nodes: Record<string, Node> = {};
  for (const each of init.nodes) nodes[each.id] = node(each, parentOf.get(each.id) ?? null);

  return makeSymbol({
    id: init.id,
    name: init.name,
    rootId: init.rootId,
    nodes,
    props: init.props ?? [],
  });
}

function prop(
  id: string,
  name: string,
  type: SymbolProp['type'],
  defaultValue: Json,
  options?: SymbolProp['options'],
): SymbolProp {
  return {
    id,
    name,
    label: name[0]!.toUpperCase() + name.slice(1),
    type,
    ...(options === undefined ? {} : { options }),
    defaultValue,
  };
}

/**
 * A document built around reusable components — the cases a symbol generator gets wrong.
 *
 * Two symbols, one of which places the other, so the nested import and the ordering of the
 * name map are exercised. A prop of every shape that changes what is written: text into a
 * binding, a number, a boolean that becomes an attribute, an enum that picks a variant.
 * Instances that override a prop, that leave one at its default, and that bind one to the
 * page's own state — which is the fact that makes a symbol worth having and the one a
 * naive generator loses, because the value is resolved where the *instance* sits.
 *
 * One instance carries styles of its own, which is the class the component has to merge
 * onto the element its root renders rather than wrap in a box.
 */
export function symbolDoc(): ProjectDoc {
  const badge = symbol({
    id: 'sym-badge',
    name: 'Status badge',
    rootId: 'badge-root',
    props: [
      prop('bp1', 'label', 'string', 'Draft'),
      prop('bp2', 'tone', 'enum', 'default', [
        { label: 'Default', value: 'default' },
        { label: 'Success', value: 'success' },
      ]),
    ],
    nodes: [
      {
        id: 'badge-root',
        type: 'Badge',
        name: 'Badge',
        bound: { text: '{{ props.label }}', variant: '{{ props.tone }}' },
      },
    ],
  });

  const card = symbol({
    id: 'sym-card',
    name: 'Product card',
    rootId: 'card-root',
    props: [
      prop('cp1', 'title', 'string', 'Untitled'),
      prop('cp2', 'price', 'number', 0),
      prop('cp3', 'featured', 'boolean', false),
      prop('cp4', 'status', 'string', 'Draft'),
    ],
    nodes: [
      {
        id: 'card-root',
        type: 'Card',
        name: 'Card',
        children: ['card-title', 'card-price', 'card-badge'],
        styles: { base: { default: { display: 'flex', flexDirection: 'column', gap: 8 } } },
      },
      {
        id: 'card-title',
        type: 'Heading',
        bound: { text: '{{ props.title }}' },
        props: { level: '3' },
      },
      {
        id: 'card-price',
        type: 'Text',
        // A number through a template hole is a string, exactly as it is on the canvas.
        bound: { text: 'From {{ props.price }} a month' },
        // The featured card is the only one that shows its price.
        showIf: '{{ props.featured }}',
      },
      // A symbol placing another symbol: the nested import, and a prop passed straight
      // through from the outer component's own props.
      {
        id: 'card-badge',
        type: 'symbol:sym-badge',
        name: 'Badge',
        bound: { label: '{{ props.status }}' },
        props: { tone: 'success' },
      },
    ],
  });

  const home = page(
    'pg-home',
    'Home',
    '/',
    'root',
    [
      {
        id: 'root',
        type: 'VStack',
        name: 'Page',
        children: ['one', 'two', 'repeated'],
        styles: { base: { default: { padding: 32 } } },
      },
      // Every prop given, including one the instance styles itself.
      {
        id: 'one',
        type: 'symbol:sym-card',
        name: 'Featured',
        props: { title: 'Aurora', price: 24, featured: true, status: 'Live' },
        styles: { base: { default: { borderColor: 'var(--primary)' } } },
      },
      // Nothing given at all: every default comes from the component's own parameters.
      { id: 'two', type: 'symbol:sym-card', name: 'Plain' },
      // The point of the whole feature: one component, once, per row of a request.
      {
        id: 'repeated',
        type: 'symbol:sym-card',
        name: 'From data',
        repeat: '{{ queries.products.data }}',
        bound: { title: '{{ item.name }}', price: '{{ item.price }}', featured: '{{ state.all }}' },
      },
    ],
    {
      state: [{ id: 'st1', name: 'all', type: 'boolean', initial: false }],
      queries: [
        {
          id: 'q1',
          name: 'products',
          method: 'GET',
          url: 'https://example.test/products',
          runOnLoad: true,
        },
      ],
    },
  );

  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: 'doc-symbols',
    name: 'Symbol Demo',
    pages: [home],
    symbols: [badge, card],
    theme: THEME,
  };
}
