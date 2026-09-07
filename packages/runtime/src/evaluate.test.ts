import { DEFAULT_THEME, type ActionScope } from '@ui-builder/schema';
import { describe, expect, it } from 'vitest';
import { createEvaluator, runStatements, type EvalRealm } from './evaluate.js';

function scopeOf(partial: Partial<ActionScope> = {}): ActionScope {
  return { state: {}, queries: {}, props: {}, theme: DEFAULT_THEME, ...partial };
}

/**
 * A realm that compiles for real but counts how often it was asked to.
 *
 * A fresh object per test on purpose: the compile cache is keyed by realm, so a new one
 * is an empty cache, and two tests cannot see each other's entries.
 */
function countingRealm(): { realm: EvalRealm; compiles: () => number } {
  let compiles = 0;
  const realm: EvalRealm = {
    Function: new Proxy(Function, {
      construct(target, args) {
        compiles += 1;
        return Reflect.construct(target, args) as object;
      },
    }) as FunctionConstructor,
  };
  return { realm, compiles: () => compiles };
}

describe('createEvaluator', () => {
  it('resolves the scope roots as named bindings', () => {
    const evaluate = createEvaluator(
      scopeOf({
        state: { count: 2 },
        queries: { users: { loading: false, data: [{ name: 'Ada' }], error: undefined } },
        item: { name: 'Row' },
        index: 3,
      }),
      { realm: countingRealm().realm },
    );

    expect(evaluate('state.count + 1')).toBe(3);
    expect(evaluate('queries.users.data[0].name')).toBe('Ada');
    expect(evaluate('item.name')).toBe('Row');
    expect(evaluate('index')).toBe(3);
    expect(evaluate('theme.colors ? "themed" : "no theme"')).toBe('themed');
  });

  it('sees the event, which is the name a render scope does not have', () => {
    const evaluate = createEvaluator(scopeOf({ event: { target: { value: 'typed' } } }), {
      realm: countingRealm().realm,
    });

    expect(evaluate('event.target.value')).toBe('typed');
  });

  it('reports a syntax error and yields undefined rather than throwing', () => {
    // It is called during render: a throw would take the node down through its error
    // boundary, so half a typed expression would blank a whole card.
    const problems: string[] = [];
    const evaluate = createEvaluator(scopeOf(), {
      realm: countingRealm().realm,
      report: ({ source, message }) => problems.push(`${source}: ${message}`),
    });

    expect(evaluate('state.count +')).toBeUndefined();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('state.count +');
  });

  it('reports a runtime error the same way', () => {
    const problems: string[] = [];
    const evaluate = createEvaluator(scopeOf(), {
      realm: countingRealm().realm,
      report: ({ message }) => problems.push(message),
    });

    expect(evaluate('state.missing.deeper')).toBeUndefined();
    expect(problems).toHaveLength(1);
  });

  it('survives a field with no reporter attached', () => {
    const evaluate = createEvaluator(scopeOf(), { realm: countingRealm().realm });
    expect(evaluate('state.count +')).toBeUndefined();
  });

  it('closes the expression on its own line, so a trailing comment cannot eat the paren', () => {
    const evaluate = createEvaluator(scopeOf(), { realm: countingRealm().realm });
    expect(evaluate('1 + 1 // two')).toBe(2);
  });

  it('compiles once per source and reuses it, failures included', () => {
    const { realm, compiles } = countingRealm();
    const evaluate = createEvaluator(scopeOf({ state: { count: 1 } }), { realm });

    evaluate('state.count');
    evaluate('state.count');
    evaluate('state.count');
    expect(compiles()).toBe(1);

    // A broken field is recompiled on every keystroke of every render otherwise.
    evaluate('state.count +');
    evaluate('state.count +');
    expect(compiles()).toBe(2);
  });

  it('compiles in the realm it was given', () => {
    const { realm, compiles } = countingRealm();
    createEvaluator(scopeOf(), { realm })('1');
    expect(compiles()).toBe(1);
  });

  it('falls back to the ambient realm when there is no frame yet', () => {
    // A page can render before its frame's document exists, and a test has no frame.
    expect(createEvaluator(scopeOf({ state: { a: 5 } }))('state.a')).toBe(5);
  });
});

describe('runStatements', () => {
  it('runs statements against the scope', () => {
    const seen: unknown[] = [];
    const scope = scopeOf({ state: { count: 4 }, event: { push: (v: unknown) => seen.push(v) } });

    runStatements('event.push(state.count * 2);', scope, countingRealm().realm);
    expect(seen).toEqual([8]);
  });

  it('throws on a syntax error, so the step that failed can be named', () => {
    expect(() => runStatements('if (', scopeOf(), countingRealm().realm)).toThrow();
  });

  it('throws on a runtime error', () => {
    expect(() => runStatements('null.x;', scopeOf(), countingRealm().realm)).toThrow();
  });

  it('runs strict, so an assignment to an undeclared name is an error not a global', () => {
    expect(() =>
      runStatements('undeclaredGlobal = 1;', scopeOf(), countingRealm().realm),
    ).toThrow();
  });

  it('compiles statements separately from an expression of the same text', () => {
    const { realm, compiles } = countingRealm();
    // `1` is a valid expression and a valid statement; the cache key carries the kind, so
    // the statement form does not pick up the expression form's compiled `return`.
    createEvaluator(scopeOf(), { realm })('1');
    runStatements('1', scopeOf(), realm);
    expect(compiles()).toBe(2);
  });
});
