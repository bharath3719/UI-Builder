import { describe, expect, it } from 'vitest';
import { makeNode, makePage, staticProp, type Page, type StateVar } from './doc.js';
import {
  collectExpressions,
  evaluateProp,
  evaluateTemplate,
  exprProp,
  hasInterpolation,
  isTruthy,
  isValidVarName,
  parseTemplate,
  referencedNames,
  referencedScopePaths,
  singleExpressionOf,
  stateVarUsage,
  stringifyValue,
  toVarName,
  uniqueVarName,
  validateTemplate,
} from './expr.js';

/** Stands in for the iframe's evaluator: looks a dotted path up in a plain object. */
function lookup(scope: Record<string, unknown>) {
  return (code: string): unknown =>
    code.split('.').reduce<unknown>((value, key) => {
      if (value === null || typeof value !== 'object') return undefined;
      return (value as Record<string, unknown>)[key.trim()];
    }, scope);
}

describe('parseTemplate', () => {
  it('splits text from holes', () => {
    expect(parseTemplate('Hi {{ state.name }}!')).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'expr', code: 'state.name' },
      { kind: 'text', text: '!' },
    ]);
  });

  it('treats an unterminated hole as text, so a half-typed field still renders', () => {
    expect(parseTemplate('Hi {{ state.')).toEqual([{ kind: 'text', text: 'Hi {{ state.' }]);
    expect(hasInterpolation('Hi {{ state.')).toBe(false);
  });

  it('reads several holes in one string', () => {
    expect(parseTemplate('{{ a }}{{ b }}').filter((s) => s.kind === 'expr')).toHaveLength(2);
  });

  it('closes a hole at the first }}, quotes and all', () => {
    // Documented in `parseTemplate`: the scanner is naive on purpose. This test exists so
    // that the limit is a decision with a name on it rather than a surprise.
    expect(parseTemplate("{{ a || '}}' }}")).toEqual([
      { kind: 'expr', code: "a || '" },
      { kind: 'text', text: "' }}" },
    ]);
  });

  it('has no holes in plain text', () => {
    expect(parseTemplate('Just words')).toEqual([{ kind: 'text', text: 'Just words' }]);
    expect(hasInterpolation('Just words')).toBe(false);
  });
});

describe('singleExpressionOf', () => {
  it('answers only when the hole is the whole value', () => {
    expect(singleExpressionOf('{{ state.busy }}')).toBe('state.busy');
    expect(singleExpressionOf('  {{ state.busy }}')).toBeNull();
    expect(singleExpressionOf('{{ a }}{{ b }}')).toBeNull();
    expect(singleExpressionOf('plain')).toBeNull();
  });
});

describe('validateTemplate', () => {
  it('accepts plain text and closed holes', () => {
    expect(validateTemplate('Hello')).toEqual({ ok: true });
    expect(validateTemplate('Hello {{ state.name }}')).toEqual({ ok: true });
  });

  it('rejects an unclosed, empty or nested hole', () => {
    expect(validateTemplate('{{ state.name')).toMatchObject({ ok: false });
    expect(validateTemplate('{{ }}')).toMatchObject({ ok: false });
    expect(validateTemplate('{{ {{ a }} }}')).toMatchObject({ ok: false });
  });
});

describe('evaluateTemplate', () => {
  const evaluate = lookup({ state: { busy: false, name: 'Ada', count: 3 } });

  it('preserves the type of a hole standing alone', () => {
    // The reason the rule exists: a bound `disabled` must be `false`, not the string
    // "false", which is truthy and would disable every button it was bound to.
    expect(evaluateTemplate('{{ state.busy }}', evaluate)).toBe(false);
    expect(evaluateTemplate('{{ state.count }}', evaluate)).toBe(3);
  });

  it('stringifies and joins mixed content', () => {
    expect(evaluateTemplate('Hi {{ state.name }} ({{ state.count }})', evaluate)).toBe(
      'Hi Ada (3)',
    );
  });

  it('renders a missing value as nothing rather than as "undefined"', () => {
    expect(evaluateTemplate('Hi {{ state.missing }}', evaluate)).toBe('Hi ');
  });

  it('returns plain text untouched', () => {
    expect(evaluateTemplate('Hi', evaluate)).toBe('Hi');
  });
});

describe('stringifyValue', () => {
  it('turns values into what an author would expect to see', () => {
    expect(stringifyValue('a')).toBe('a');
    expect(stringifyValue(2)).toBe('2');
    expect(stringifyValue(true)).toBe('true');
    expect(stringifyValue(null)).toBe('');
    expect(stringifyValue(undefined)).toBe('');
    expect(stringifyValue(Number.NaN)).toBe('');
    expect(stringifyValue({ a: 1 })).toBe('{"a":1}');
    expect(stringifyValue([1, 2])).toBe('[1,2]');
  });

  it('survives a value that cannot be serialized', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    expect(stringifyValue(circular)).toBe('');
  });
});

describe('evaluateProp', () => {
  const evaluate = lookup({ state: { name: 'Ada' } });

  it('reads a literal without touching the evaluator', () => {
    expect(
      evaluateProp(staticProp('plain'), () => {
        throw new Error('a static prop must never be evaluated');
      }),
    ).toBe('plain');
  });

  it('runs a bound one', () => {
    expect(evaluateProp(exprProp('{{ state.name }}'), evaluate)).toBe('Ada');
  });

  it('reads an absent prop as undefined', () => {
    expect(evaluateProp(undefined, evaluate)).toBeUndefined();
  });
});

describe('isTruthy', () => {
  it('treats an empty array as false, which JavaScript does not', () => {
    // `showIf` bound to a query's rows should hide the section when there are none.
    expect(isTruthy([])).toBe(false);
    expect(isTruthy([0])).toBe(true);
    expect(isTruthy('')).toBe(false);
    expect(isTruthy(undefined)).toBe(false);
    expect(isTruthy({})).toBe(true);
  });
});

describe('names', () => {
  it('accepts identifiers, including reserved words', () => {
    // Access is always `state.<name>`, and every reserved word is legal after a dot.
    expect(isValidVarName('count')).toBe(true);
    expect(isValidVarName('_x2')).toBe(true);
    expect(isValidVarName('class')).toBe(true);
    expect(isValidVarName('2count')).toBe(false);
    expect(isValidVarName('user name')).toBe(false);
    expect(isValidVarName('')).toBe(false);
  });

  it('turns a typed label into a name', () => {
    expect(toVarName('User list')).toBe('userList');
    expect(toVarName('  is  open ')).toBe('isOpen');
    expect(toVarName('2 things')).toBe('_2Things');
    expect(toVarName('!!!')).toBe('');
  });

  it('counts up rather than colliding', () => {
    expect(uniqueVarName(['count'], 'count')).toBe('count2');
    expect(uniqueVarName(['count', 'count2'], 'count')).toBe('count3');
    expect(uniqueVarName([], 'User list')).toBe('userList');
  });
});

describe('referencedScopePaths', () => {
  it('finds what a hole reads', () => {
    expect(referencedScopePaths('{{ state.count + state.step }}')).toEqual([
      'state.count',
      'state.step',
    ]);
    expect(referencedScopePaths('{{ queries.users.data.length }}')).toEqual(['queries.users']);
  });

  it('ignores the literal text around the holes', () => {
    expect(referencedScopePaths('state.count is {{ state.count }}')).toEqual(['state.count']);
  });

  it('reads names by root', () => {
    expect(referencedNames('{{ state.a }}{{ queries.b.data }}', 'state')).toEqual(['a']);
    expect(referencedNames('{{ state.a }}{{ queries.b.data }}', 'queries')).toEqual(['b']);
  });
});

describe('collectExpressions', () => {
  const variable: StateVar = { id: 's1', name: 'name', type: 'string', initial: '' };

  function page(): Page {
    return makePage({
      id: 'p',
      rootId: 'root',
      nodes: {
        root: makeNode({ id: 'root', type: 'Box', name: 'Page', children: ['a'] }),
        a: makeNode({
          id: 'a',
          parentId: 'root',
          type: 'Text',
          name: 'Greeting',
          props: { text: exprProp('Hi {{ state.name }}'), size: staticProp('md') },
          showIf: exprProp('{{ state.name }}'),
          repeat: { over: exprProp('{{ queries.users.data }}') },
          events: {
            onClick: [
              { kind: 'setState', stateId: 's1', value: exprProp('{{ item.id }}') },
              { kind: 'toggleState', stateId: 's1' },
              { kind: 'custom', code: 'console.log(state.name)' },
            ],
          },
        }),
      },
      state: [variable],
      queries: [
        {
          id: 'q1',
          name: 'users',
          method: 'GET',
          url: '/api/users?q={{ state.name }}',
          headers: { 'X-Tenant': '{{ state.name }}' },
          body: '{{ state.name }}',
          runOnLoad: true,
        },
      ],
    });
  }

  it('finds every place an expression can hide', () => {
    expect(
      collectExpressions(page())
        .map((site) => site.path)
        .sort(),
    ).toEqual([
      'events.onClick[0].value',
      'events.onClick[2].code',
      'props.text',
      'queries.users.body',
      'queries.users.headers.X-Tenant',
      'queries.users.url',
      'repeat.over',
      'showIf',
    ]);
  });

  it('does not report a static prop', () => {
    expect(collectExpressions(page()).some((site) => site.path === 'props.size')).toBe(false);
  });

  it('answers where a variable is used, by the name expressions reach it by', () => {
    // The `toggleState` step targets the same variable by id and is deliberately absent:
    // this is the by-name question, and it is the one a rename has to ask.
    expect(
      stateVarUsage(page(), variable)
        .map((site) => site.path)
        .sort(),
    ).toEqual([
      'events.onClick[2].code',
      'props.text',
      'queries.users.body',
      'queries.users.headers.X-Tenant',
      'queries.users.url',
      'showIf',
    ]);
  });
});
