/**
 * What a page's state, queries, handlers, `repeat` and `showIf` become — PLAN.md §11.
 *
 * The snapshot at the end is the contract, as it is for the markup: this is what a user's
 * exported page looks like, and a diff in it is a change to that. The tests before it say
 * *why* the output is shaped the way it is, so a diff can be read as a decision changing
 * rather than as bytes moving.
 *
 * The rule they are all circling is D6, applied to bindings instead of to CSS: the same
 * expression text runs on the canvas and here, and the coercion written around it is the
 * one the canvas applied. Where that cannot be kept — a transform whose *shape* is the
 * text it parses — the export says so out loud rather than shipping something different.
 */

import {
  DEFAULT_THEME,
  exprProp,
  makeNode,
  makePage,
  staticProp,
  type ActionStep,
  type Node,
  type Page,
  type QueryDef,
  type StateVar,
} from '@ui-builder/schema';
import { describe, expect, test } from 'vitest';
import { interactiveDoc } from './fixtures.js';
import { generatePage } from './page.js';
import { generateProject } from './project.js';

interface Init {
  type?: string;
  name?: string;
  props?: Record<string, unknown>;
  bound?: Record<string, string>;
  events?: Record<string, ActionStep[]>;
  repeat?: string;
  showIf?: string;
  children?: Record<string, Init>;
  state?: StateVar[];
  queries?: QueryDef[];
}

/** One page built from a sketch, so each test reads as the document it is about. */
function pageOf(init: Init): Page {
  const nodes: Record<string, Node> = {};

  const build = (id: string, node: Init, parentId: string | null): void => {
    const childIds = Object.keys(node.children ?? {});
    nodes[id] = makeNode({
      id,
      parentId,
      type: node.type ?? 'Box',
      name: node.name ?? id,
      children: childIds,
      props: {
        ...Object.fromEntries(
          Object.entries(node.props ?? {}).map(([name, value]) => [
            name,
            staticProp(value as never),
          ]),
        ),
        ...Object.fromEntries(
          Object.entries(node.bound ?? {}).map(([name, code]) => [name, exprProp(code)]),
        ),
      },
      ...(node.events === undefined ? {} : { events: node.events }),
      ...(node.repeat === undefined ? {} : { repeat: { over: exprProp(node.repeat) } }),
      ...(node.showIf === undefined ? {} : { showIf: exprProp(node.showIf) }),
    });

    for (const [childId, child] of Object.entries(node.children ?? {})) build(childId, child, id);
  };

  build('root', init, null);

  return makePage({
    id: 'p',
    name: 'Home',
    path: '/',
    rootId: 'root',
    nodes,
    state: init.state ?? [],
    queries: init.queries ?? [],
  });
}

function tsxOf(init: Init): string {
  return generatePage(pageOf(init), DEFAULT_THEME).tsx;
}

const COUNT: StateVar = { id: 'sv1', name: 'count', type: 'number', initial: 0 };

describe('bound props', () => {
  test('a hole standing alone keeps its type, so a bound boolean is not the string "false"', () => {
    // The rule `evaluateTemplate` applies at render time, applied here at generation time.
    // Without it `disabled={"false"}` would disable every button whose expression said not
    // to — the single most costly way for the export to disagree with the canvas.
    const tsx = tsxOf({ type: 'Button', bound: { disabled: '{{ state.busy }}' }, state: [COUNT] });

    expect(tsx).toContain('disabled={truthy(state.busy)}');
    expect(tsx).not.toContain('disabled="false"');
  });

  test('mixed content is a template literal, with each hole stringified', () => {
    const tsx = tsxOf({ type: 'Text', bound: { text: 'Hi {{ state.name }}, welcome' } });

    expect(tsx).toContain('{`Hi ${text(state.name)}, welcome`}');
    // No `text()` around the template literal: it is already a string and never null.
    expect(tsx).not.toContain('text(`Hi');
  });

  test('an enum coercion survives as a call, so an unknown value still falls back', () => {
    // The static side answers this by writing the fallback word into the class list. The
    // bound side cannot, so it writes the same decision as code rather than trusting
    // whatever the expression produces to be one of the options.
    const tsx = tsxOf({ type: 'Button', bound: { variant: '{{ state.kind }}' } });

    expect(tsx).toMatch(/data-variant=\{pick\(state\.kind, \[[^\]]+\], 'default'\)\}/);
  });

  test('a bound flag is present or absent, never false', () => {
    // `css.ts` matches `:where([data-wrap])` on presence, so an attribute that resolved to
    // `false` would still match. `undefined` is how React is told to leave it off.
    const tsx = tsxOf({ type: 'HStack', bound: { wrap: '{{ state.wrap }}' } });

    expect(tsx).toContain("data-wrap={truthy(state.wrap) ? 'true' : undefined}");
  });

  test('a bound condition makes the element conditional rather than the attribute', () => {
    // A Switch draws its label only when there is one. Statically that decides whether the
    // span is written at all; bound, the page has to decide it.
    const tsx = tsxOf({ type: 'Switch', bound: { label: '{{ state.label }}' } });

    expect(tsx).toContain('{text(state.label) !== \'\' && <span className="ub-switch-label">');
  });

  test('an expression that is not a plain path is bracketed before it is embedded', () => {
    const tsx = tsxOf({ type: 'Text', bound: { text: "{{ a ? 'y' : 'n' }}" } });

    expect(tsx).toContain("{text(a ? 'y' : 'n', 'Text')}");
  });

  test('a page with no bindings imports no helpers and ships no lib', () => {
    const { tsx, runtime } = generatePage(
      pageOf({ type: 'Text', props: { text: 'Hi' } }),
      DEFAULT_THEME,
    );

    expect(tsx).not.toContain('lib/values');
    expect(runtime).toEqual([]);
  });
});

describe('state', () => {
  test('is one object, because nothing rewrites the text the author typed', () => {
    // The alternative — `count` and `setCount` per variable, with `state.count` rewritten
    // to `count` — needs a source transform reliable enough to edit user code. One object
    // means the canvas and the export evaluate the same string (§11).
    const tsx = tsxOf({
      type: 'Text',
      bound: { text: '{{ state.count }}' },
      state: [COUNT],
    });

    expect(tsx).toContain('const [state] = useState<Record<string, any>>({ count: 0 });');
    expect(tsx).toContain("{text(state.count, 'Text')}");
  });

  test('declares only the half the page uses', () => {
    // The generated project sets `noUnusedLocals`, so a setter nobody calls is a build
    // failure rather than an untidiness — and array elision is how JavaScript skips one.
    const writeOnly = tsxOf({
      type: 'Button',
      name: 'Add',
      state: [COUNT],
      events: { onClick: [{ kind: 'setState', stateId: 'sv1', value: staticProp(1) }] },
    });

    expect(writeOnly).toContain('const [, setState] =');
  });

  test('is not declared at all when nothing reads or writes it', () => {
    const tsx = tsxOf({ type: 'Text', props: { text: 'Hi' }, state: [COUNT] });

    expect(tsx).not.toContain('useState');
  });
});

describe('handlers', () => {
  test('are named functions, hoisted out of the attribute', () => {
    const tsx = tsxOf({
      type: 'Button',
      name: 'Count up',
      state: [COUNT],
      events: {
        onClick: [{ kind: 'setState', stateId: 'sv1', value: exprProp('{{ state.count + 1 }}') }],
      },
    });

    expect(tsx).toContain('const onCountUpClick = () => {');
    expect(tsx).toContain('setState((current) => ({ ...current, count: state.count + 1 }));');
    expect(tsx).toContain('onClick={onCountUpClick}');
  });

  test('take an event parameter only when a step reads one', () => {
    // `noUnusedParameters` again: a parameter nobody reads fails the export's own build,
    // and a missing one fails where it is used. Both directions have to be right.
    const reads = tsxOf({
      type: 'Input',
      name: 'Search',
      state: [COUNT],
      events: {
        onChange: [
          { kind: 'setState', stateId: 'sv1', value: exprProp('{{ event.target.value }}') },
        ],
      },
    });
    const does_not = tsxOf({
      type: 'Input',
      name: 'Search',
      state: [COUNT],
      events: {
        onChange: [{ kind: 'setState', stateId: 'sv1', value: exprProp("{{ 'the event' }}") }],
      },
    });

    expect(reads).toContain('(event: ChangeEvent<HTMLInputElement>)');
    expect(reads).toContain("import { useState, type ChangeEvent } from 'react';");
    expect(does_not).toContain('const onSearchChange = () => {');
  });

  test('a toggle reads the value it is inverting from the update, not from the render', () => {
    // Two toggles in one handler are two flips. Through the render's `state` they would be
    // one, which is the reducer's rule in the runtime kept here by the updater form.
    const tsx = tsxOf({
      type: 'Button',
      name: 'Flip',
      state: [{ id: 'sv1', name: 'open', type: 'boolean', initial: false }],
      events: {
        onClick: [
          { kind: 'toggleState', stateId: 'sv1' },
          { kind: 'toggleState', stateId: 'sv1' },
        ],
      },
    });

    expect(tsx).toContain('setState((current) => ({ ...current, open: !truthy(current.open) }));');
  });

  test('a step naming something deleted is dropped, and said out loud', () => {
    const { tsx, warnings } = generatePage(
      pageOf({
        type: 'Button',
        name: 'Save',
        events: { onClick: [{ kind: 'setState', stateId: 'gone', value: staticProp(1) }] },
      }),
      DEFAULT_THEME,
    );

    // The whole handler goes with its only step, so nothing is declared and nothing is
    // referenced — the alternative is an empty function wired to a button.
    expect(tsx).not.toContain('onClick');
    expect(warnings[0]).toContain('sets a variable that no longer exists');
  });

  test('a run-a-query step is awaited, which makes its handler async', () => {
    const tsx = tsxOf({
      type: 'Button',
      name: 'Reload',
      queries: [
        { id: 'q1', name: 'people', method: 'GET', url: 'https://x.test/p', runOnLoad: false },
      ],
      events: { onClick: [{ kind: 'runQuery', queryId: 'q1' }] },
    });

    expect(tsx).toContain('const onReloadClick = async () => {');
    expect(tsx).toContain('await queries.people.run();');
  });
});

describe('repeat and showIf', () => {
  test('a repeat is a map, and a handler inside it stays inside it', () => {
    // The handler closes over the `item` its copy was rendered for, which is how "open
    // this one" knows which one. Hoisting it to the component body would lose exactly that.
    const tsx = tsxOf({
      type: 'VStack',
      children: {
        row: {
          type: 'Button',
          name: 'Open',
          repeat: '{{ queries.people.data }}',
          events: { onClick: [{ kind: 'navigate', to: exprProp('/p/{{ item.id }}') }] },
          queries: [],
        },
      },
      queries: [
        { id: 'q1', name: 'people', method: 'GET', url: 'https://x.test/p', runOnLoad: true },
      ],
    });

    expect(tsx).toContain('{list(queries.people.data).map((item, index) => {');
    // Declared inside the callback, indented past it.
    expect(tsx).toMatch(/\{\n\s+const onOpenClick = \(\) => \{/);
    expect(tsx).toContain('key={index}');
  });

  test('a repeat with nothing to declare keeps the concise arrow', () => {
    const tsx = tsxOf({
      type: 'VStack',
      children: { row: { type: 'Text', bound: { text: '{{ item.name }}' }, repeat: '{{ rows }}' } },
    });

    expect(tsx).toContain('{list(rows).map((item, index) => (');
  });

  test('a showIf is a guarded &&, not a bare one', () => {
    // `0 && <div />` renders a nought. `truthy` also makes an empty array falsy, which is
    // what "show this when the list has rows" means and what plain JavaScript disagrees
    // with.
    const tsx = tsxOf({ type: 'Text', props: { text: 'Empty' }, showIf: '{{ rows }}' });

    expect(tsx).toContain('{truthy(rows) && ');
  });

  test('a condition the document already answers leaves the node out entirely', () => {
    const page = pageOf({ type: 'VStack', children: { gone: { type: 'Text' } } });
    page.nodes['gone']!.showIf = staticProp(false);

    const { tsx } = generatePage(page, DEFAULT_THEME);

    expect(tsx).not.toContain('&&');
    expect(tsx).not.toContain('ub-text');
  });
});

describe('queries', () => {
  test('interpolate the page into the request, so a search box needs no wiring', () => {
    const tsx = tsxOf({
      type: 'Text',
      bound: { text: '{{ queries.people.loading }}' },
      state: [{ id: 'sv1', name: 'q', type: 'string', initial: '' }],
      queries: [
        {
          id: 'q1',
          name: 'people',
          method: 'GET',
          url: 'https://x.test/p?q={{ state.q }}',
          runOnLoad: true,
        },
      ],
    });

    expect(tsx).toContain('const queries = {');
    expect(tsx).toContain('url: `https://x.test/p?q=${text(state.q)}`,');
    expect(tsx).toContain('runOnLoad: true,');
  });

  test('one that reads its own result is not run on load', () => {
    // The same `cyclicQueries` the Data panel and the canvas use, which is why it lives in
    // `schema`: a request that changes itself is a fetch loop, and the export is the worst
    // of the three places to discover one.
    const tsx = tsxOf({
      type: 'Text',
      bound: { text: '{{ queries.people.error }}' },
      queries: [
        {
          id: 'q1',
          name: 'people',
          method: 'GET',
          url: 'https://x.test/p?after={{ queries.people.data }}',
          runOnLoad: true,
        },
      ],
    });

    expect(tsx).toContain('runOnLoad: false,');
  });

  test('one nothing reads is still sent when it runs on load', () => {
    const tsx = tsxOf({
      type: 'Text',
      props: { text: 'Hi' },
      queries: [
        { id: 'q1', name: 'ping', method: 'GET', url: 'https://x.test/ping', runOnLoad: true },
      ],
    });

    expect(tsx).toContain('useQuery({');
    expect(tsx).not.toContain('const queries');
  });
});

describe('what the export cannot carry', () => {
  test('a bound option list exports empty, and says so', () => {
    // The transform's *shape* is the text it parses, which is why it is a transform at all
    // (`emit.ts`). Making it dynamic means shipping its parser and writing its markup a
    // second time; a silently empty `<select>` is the failure this warning exists to avoid.
    const { tsx, warnings } = generatePage(
      pageOf({ type: 'Select', name: 'Choice', bound: { options: '{{ state.options }}' } }),
      DEFAULT_THEME,
    );

    expect(tsx).not.toContain('<option');
    expect(warnings[0]).toContain('the option list is built from "options"');
  });

  test('a bound element name exports as its fallback, and says so', () => {
    const { tsx, warnings } = generatePage(
      pageOf({ type: 'Heading', name: 'Title', bound: { level: '{{ state.level }}' } }),
      DEFAULT_THEME,
    );

    expect(tsx).toContain('<h2');
    expect(warnings[0]).toContain('the element depends on "level"');
  });
});

describe('the interactive project', () => {
  test('ships the lib files its pages reach for, and only those', () => {
    const { files } = generateProject(interactiveDoc());

    expect(files.map((file) => file.path)).toContain('src/lib/values.ts');
    expect(files.map((file) => file.path)).toContain('src/lib/query.ts');
    expect(files.map((file) => file.path)).toContain('src/lib/toast.tsx');
    expect(files.map((file) => file.path)).toContain('src/lib/navigate.ts');
    // Nothing on it drags a table row.
    expect(files.map((file) => file.path)).not.toContain('src/components/SortableRows.tsx');
  });

  test('exports without a warning', () => {
    expect(generateProject(interactiveDoc()).warnings).toEqual([]);
  });

  test('is this page', () => {
    const { files } = generateProject(interactiveDoc());
    const page = files.find((file) => file.path === 'src/pages/Home.tsx');

    expect(page?.contents).toMatchSnapshot();
  });
});
