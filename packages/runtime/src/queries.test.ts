import { DEFAULT_THEME, type Json, type QueryDef, type QueryState } from '@ui-builder/schema';
import { describe, expect, it } from 'vitest';
import { createEvaluator } from './evaluate.js';
import { buildRequest, cyclicQueries } from './queries.js';

function evaluatorFor(state: Record<string, Json> = {}, queries: Record<string, QueryState> = {}) {
  return createEvaluator({ state, queries, props: {}, theme: DEFAULT_THEME });
}

function query(init: Partial<QueryDef> & Pick<QueryDef, 'id' | 'name'>): QueryDef {
  return {
    method: 'GET',
    url: '/api/thing',
    runOnLoad: false,
    ...init,
  };
}

describe('buildRequest', () => {
  it('interpolates the url', () => {
    const request = buildRequest(
      query({ id: 'q1', name: 'user', url: '/api/users/{{ state.id }}' }),
      evaluatorFor({ id: 42 }),
    );

    expect(request.url).toBe('/api/users/42');
    expect(request.method).toBe('GET');
  });

  it('interpolates header values', () => {
    const request = buildRequest(
      query({ id: 'q1', name: 'user', headers: { Authorization: 'Bearer {{ state.token }}' } }),
      evaluatorFor({ token: 'abc' }),
    );

    expect(request.headers).toEqual({ Authorization: 'Bearer abc' });
  });

  it('interpolates the body', () => {
    const request = buildRequest(
      query({
        id: 'q1',
        name: 'save',
        method: 'POST',
        body: '{"name": "{{ state.name }}"}',
      }),
      evaluatorFor({ name: 'Ada' }),
    );

    expect(request.body).toBe('{"name": "Ada"}');
  });

  it('leaves a body-less query without one', () => {
    expect(buildRequest(query({ id: 'q1', name: 'list' }), evaluatorFor()).body).toBeUndefined();
  });

  it('has no headers when none are declared', () => {
    expect(buildRequest(query({ id: 'q1', name: 'list' }), evaluatorFor()).headers).toEqual({});
  });

  it('renders an unresolved binding as empty text rather than as "undefined"', () => {
    const request = buildRequest(
      query({ id: 'q1', name: 'user', url: '/api/users/{{ state.missing }}' }),
      evaluatorFor(),
    );

    expect(request.url).toBe('/api/users/');
  });

  it('reads another query, which is what chains one onto another', () => {
    const request = buildRequest(
      query({ id: 'q2', name: 'posts', url: '/api/users/{{ queries.user.data.id }}/posts' }),
      evaluatorFor({}, { user: { loading: false, data: { id: 9 }, error: undefined } }),
    );

    expect(request.url).toBe('/api/users/9/posts');
  });

  it('keys a request by everything the fetch depends on', () => {
    const definition = query({ id: 'q1', name: 'user', url: '/api/users/{{ state.id }}' });

    const first = buildRequest(definition, evaluatorFor({ id: 1 }));
    const same = buildRequest(definition, evaluatorFor({ id: 1 }));
    const other = buildRequest(definition, evaluatorFor({ id: 2 }));

    // Equal keys are what stop the auto-run effect re-fetching on every render...
    expect(first.key).toBe(same.key);
    // ...and a changed one is what makes a search box re-query with no wiring.
    expect(first.key).not.toBe(other.key);
  });

  it('keys on the method, the headers and the body too, not just the url', () => {
    const base = query({ id: 'q1', name: 'save', method: 'POST', body: '{}' });

    expect(buildRequest(base, evaluatorFor()).key).not.toBe(
      buildRequest({ ...base, body: '{"a":1}' }, evaluatorFor()).key,
    );
    expect(buildRequest(base, evaluatorFor()).key).not.toBe(
      buildRequest({ ...base, method: 'PUT' }, evaluatorFor()).key,
    );
    expect(buildRequest(base, evaluatorFor()).key).not.toBe(
      buildRequest({ ...base, headers: { A: 'b' } }, evaluatorFor()).key,
    );
  });
});

describe('cyclicQueries', () => {
  it('finds a query that reads its own result', () => {
    const self = query({ id: 'q1', name: 'users', url: '/api?page={{ queries.users.data.next }}' });
    expect([...cyclicQueries([self])]).toEqual(['q1']);
  });

  it('finds a cycle through another query', () => {
    const a = query({ id: 'qa', name: 'a', url: '/a/{{ queries.b.data }}' });
    const b = query({ id: 'qb', name: 'b', url: '/b/{{ queries.a.data }}' });
    expect(cyclicQueries([a, b])).toEqual(new Set(['qa', 'qb']));
  });

  it('allows a chain that does not come back round', () => {
    const a = query({ id: 'qa', name: 'a', url: '/a' });
    const b = query({ id: 'qb', name: 'b', url: '/b/{{ queries.a.data }}' });
    const c = query({ id: 'qc', name: 'c', url: '/c/{{ queries.b.data }}' });
    expect(cyclicQueries([a, b, c]).size).toBe(0);
  });

  it('sees a dependency in a header or a body, not only in the url', () => {
    const viaHeader = query({
      id: 'q1',
      name: 'users',
      headers: { Cursor: '{{ queries.users.data.next }}' },
    });
    expect([...cyclicQueries([viaHeader])]).toEqual(['q1']);

    const viaBody = query({
      id: 'q2',
      name: 'rows',
      method: 'POST',
      body: '{{ queries.rows.data }}',
    });
    expect([...cyclicQueries([viaBody])]).toEqual(['q2']);
  });

  it('ignores a reference to a query that does not exist', () => {
    const orphan = query({ id: 'q1', name: 'a', url: '/a/{{ queries.gone.data }}' });
    expect(cyclicQueries([orphan]).size).toBe(0);
  });

  it('reads state without calling it a dependency', () => {
    const plain = query({ id: 'q1', name: 'a', url: '/a/{{ state.id }}' });
    expect(cyclicQueries([plain]).size).toBe(0);
  });

  it('has nothing to say about no queries', () => {
    expect(cyclicQueries([]).size).toBe(0);
  });
});
