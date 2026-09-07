import {
  DEFAULT_THEME,
  exprProp,
  makePage,
  staticProp,
  type ActionScope,
  type ActionStep,
  type Json,
  type Page,
} from '@ui-builder/schema';
import { describe, expect, it, vi } from 'vitest';
import { asJson, runSteps, type ActionHost } from './actions.js';
import { createEvaluator } from './evaluate.js';

const COUNT = 'sv_count';
const FLAG = 'sv_flag';
const USERS = 'q_users';

function pageWith(): Page {
  return makePage({
    id: 'p1',
    rootId: 'n1',
    nodes: {},
    state: [
      { id: COUNT, name: 'count', type: 'number', initial: 0 },
      { id: FLAG, name: 'flag', type: 'boolean', initial: false },
    ],
    queries: [{ id: USERS, name: 'users', method: 'GET', url: '/api/users', runOnLoad: false }],
  });
}

/** Everything a step can do, recorded rather than done. */
function hostFor(scope: Partial<ActionScope> = {}) {
  const log: string[] = [];
  const reports: string[] = [];

  const host: ActionHost = {
    page: pageWith(),
    evaluate: createEvaluator({
      state: { count: 1 },
      queries: {},
      props: {},
      theme: DEFAULT_THEME,
      ...scope,
    }),
    setState: (id, value) => log.push(`setState ${id}=${JSON.stringify(value)}`),
    toggleState: (id) => log.push(`toggleState ${id}`),
    runQuery: async (id) => {
      log.push(`runQuery:start ${id}`);
      await Promise.resolve();
      log.push(`runQuery:done ${id}`);
    },
    navigate: (to) => log.push(`navigate ${to}`),
    toast: (message) => log.push(`toast ${message}`),
    runCode: (code) => log.push(`runCode ${code}`),
    report: (message) => reports.push(message),
  };

  return { host, log, reports };
}

describe('asJson', () => {
  it('keeps what a state variable can hold', () => {
    expect(asJson('text')).toBe('text');
    expect(asJson(true)).toBe(true);
    expect(asJson(7)).toBe(7);
    expect(asJson(null)).toBeNull();
  });

  it('passes objects and arrays through unexamined', () => {
    const rows: Json = [{ id: 1 }];
    expect(asJson(rows)).toBe(rows);
  });

  it('turns what JSON cannot carry into null', () => {
    expect(asJson(undefined)).toBeNull();
    expect(asJson(Number.NaN)).toBeNull();
    expect(asJson(Number.POSITIVE_INFINITY)).toBeNull();
    expect(asJson(() => 1)).toBeNull();
    expect(asJson(Symbol('s'))).toBeNull();
  });
});

describe('runSteps', () => {
  it('sets a variable to an evaluated expression', async () => {
    const { host, log } = hostFor({ state: { count: 4 } });
    await runSteps(
      [{ kind: 'setState', stateId: COUNT, value: exprProp('{{ state.count + 1 }}') }],
      host,
    );
    expect(log).toEqual([`setState ${COUNT}=5`]);
  });

  it('keeps a bound value its own type rather than its string form', async () => {
    // The single-hole rule from `expr.ts`: `{{ state.count }}` is a number here, so a
    // variable does not silently become the string "5".
    const { host, log } = hostFor({ state: { count: 5 } });
    await runSteps(
      [{ kind: 'setState', stateId: COUNT, value: exprProp('{{ state.count }}') }],
      host,
    );
    expect(log).toEqual([`setState ${COUNT}=5`]);
  });

  it('sets a literal', async () => {
    const { host, log } = hostFor();
    await runSteps([{ kind: 'setState', stateId: COUNT, value: staticProp(9) }], host);
    expect(log).toEqual([`setState ${COUNT}=9`]);
  });

  it('reads the event, which is how an input binds to a variable', async () => {
    const { host, log } = hostFor({ event: { target: { value: 'typed' } } });
    await runSteps(
      [{ kind: 'setState', stateId: COUNT, value: exprProp('{{ event.target.value }}') }],
      host,
    );
    expect(log).toEqual([`setState ${COUNT}="typed"`]);
  });

  it('toggles a variable', async () => {
    const { host, log } = hostFor();
    await runSteps([{ kind: 'toggleState', stateId: FLAG }], host);
    expect(log).toEqual([`toggleState ${FLAG}`]);
  });

  it('reports a step pointing at a variable that is gone, and does nothing', async () => {
    const { host, log, reports } = hostFor();
    await runSteps(
      [
        { kind: 'setState', stateId: 'deleted', value: staticProp(1) },
        { kind: 'toggleState', stateId: 'deleted' },
      ],
      host,
    );

    expect(log).toEqual([]);
    expect(reports).toEqual([
      'sets a variable that no longer exists',
      'toggles a variable that no longer exists',
    ]);
  });

  it('reports a query that is gone', async () => {
    const { host, log, reports } = hostFor();
    await runSteps([{ kind: 'runQuery', queryId: 'deleted' }], host);
    expect(log).toEqual([]);
    expect(reports).toEqual(['runs a query that no longer exists']);
  });

  it('awaits a query, so a step after it happens after the request', async () => {
    // The only reason a step list is sequential at all.
    const { host, log } = hostFor();
    await runSteps(
      [
        { kind: 'runQuery', queryId: USERS },
        { kind: 'showToast', message: staticProp('Saved') },
      ],
      host,
    );

    expect(log).toEqual([`runQuery:start ${USERS}`, `runQuery:done ${USERS}`, 'toast Saved']);
  });

  it('navigates to an interpolated path', async () => {
    const { host, log } = hostFor({ state: { count: 12 } });
    await runSteps([{ kind: 'navigate', to: exprProp('/users/{{ state.count }}') }], host);
    expect(log).toEqual(['navigate /users/12']);
  });

  it('reports a navigation with nowhere to go', async () => {
    const { host, log, reports } = hostFor();
    await runSteps([{ kind: 'navigate', to: staticProp('') }], host);
    expect(log).toEqual([]);
    expect(reports).toEqual(['navigates nowhere']);
  });

  it('stringifies a toast message', async () => {
    const { host, log } = hostFor({ state: { count: 3 } });
    await runSteps([{ kind: 'showToast', message: exprProp('{{ state.count }} left') }], host);
    expect(log).toEqual(['toast 3 left']);
  });

  it('runs a custom step as statements', async () => {
    const { host, log } = hostFor();
    await runSteps([{ kind: 'custom', code: 'console.log(1)' }], host);
    expect(log).toEqual(['runCode console.log(1)']);
  });

  it('runs steps in order', async () => {
    const { host, log } = hostFor();
    await runSteps(
      [
        { kind: 'toggleState', stateId: FLAG },
        { kind: 'showToast', message: staticProp('one') },
        { kind: 'navigate', to: staticProp('/done') },
      ],
      host,
    );

    expect(log).toEqual([`toggleState ${FLAG}`, 'toast one', 'navigate /done']);
  });

  it('stops at a failing step and names it, without rethrowing', async () => {
    // A sequence that saves and then navigates must not navigate when the save threw —
    // and an exception escaping a React handler is an unhandled rejection.
    const { host, log, reports } = hostFor();
    host.runCode = () => {
      throw new Error('boom');
    };

    const steps: ActionStep[] = [
      { kind: 'showToast', message: staticProp('first') },
      { kind: 'custom', code: 'throw' },
      { kind: 'navigate', to: staticProp('/never') },
    ];

    await expect(runSteps(steps, host)).resolves.toBeUndefined();
    expect(log).toEqual(['toast first']);
    expect(reports).toEqual(['step 2 (custom) failed: boom']);
  });

  it('does nothing for an empty handler', async () => {
    const { host, log, reports } = hostFor();
    await runSteps([], host);
    expect(log).toEqual([]);
    expect(reports).toEqual([]);
  });

  it('reports a broken expression through the evaluator rather than failing the step', async () => {
    // The evaluator swallows and reports; the value simply lands as undefined -> null.
    const report = vi.fn();
    const { host, log } = hostFor();
    host.evaluate = createEvaluator(
      { state: {}, queries: {}, props: {}, theme: DEFAULT_THEME },
      { report },
    );

    await runSteps([{ kind: 'setState', stateId: COUNT, value: exprProp('{{ nope( }}') }], host);
    expect(log).toEqual([`setState ${COUNT}=null`]);
    expect(report).toHaveBeenCalledOnce();
  });
});
