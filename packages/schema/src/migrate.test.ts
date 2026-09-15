import { describe, expect, it } from 'vitest';
// `structuredClone` is not in the ES2023 lib this package compiles against, which is
// the whole reason `cloneJson` exists (doc.ts).
import { DOC_SCHEMA_VERSION, cloneJson, type ProjectDoc } from './doc.js';
import { DocMigrationError, isCurrentSchema, migrateDoc } from './migrate.js';
import { DEFAULT_THEME } from './theme.js';

function makeDoc(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: 'proj1',
    name: 'Landing',
    pages: [
      {
        id: 'page1',
        name: 'Home',
        path: '/',
        rootId: 'root',
        nodes: {
          root: {
            id: 'root',
            parentId: null,
            type: 'Box',
            name: 'Page',
            children: [],
            props: {},
            styles: {},
            events: {},
          },
        },
        state: [],
        queries: [],
      },
    ],
    symbols: [],
    theme: DEFAULT_THEME,
    ...overrides,
  };
}

describe('migrateDoc', () => {
  it('returns a current document unchanged', () => {
    const doc = makeDoc();

    expect(migrateDoc(cloneJson(doc))).toEqual(doc);
  });

  it('rejects a document from a newer build rather than guessing at a downgrade', () => {
    const doc = { ...makeDoc(), schemaVersion: DOC_SCHEMA_VERSION + 1 };

    expect(() => migrateDoc(doc)).toThrow(DocMigrationError);
    expect(() => migrateDoc(doc)).toThrow(/newer version/i);
  });

  it('rejects anything that is not a document object', () => {
    for (const value of [null, undefined, 42, 'doc', []]) {
      expect(() => migrateDoc(value)).toThrow(DocMigrationError);
    }
  });

  it('rejects a document with no usable schemaVersion', () => {
    expect(() => migrateDoc({ ...makeDoc(), schemaVersion: undefined })).toThrow(/schemaVersion/);
    expect(() => migrateDoc({ ...makeDoc(), schemaVersion: 0 })).toThrow(/schemaVersion/);
    expect(() => migrateDoc({ ...makeDoc(), schemaVersion: '1' })).toThrow(/schemaVersion/);
  });

  it('rejects a document that does not match the model', () => {
    // A missing rootId is the shape of corruption that would otherwise surface as an
    // undefined three components into the renderer.
    const broken = makeDoc();
    delete (broken.pages[0] as Partial<(typeof broken.pages)[number]>).rootId;

    expect(() => migrateDoc(broken)).toThrow(DocMigrationError);
  });

  it('rejects a document with no pages', () => {
    expect(() => migrateDoc(makeDoc({ pages: [] }))).toThrow(DocMigrationError);
  });

  it('reports whether a document is already current', () => {
    expect(isCurrentSchema(makeDoc())).toBe(true);
    expect(isCurrentSchema(makeDoc({ schemaVersion: DOC_SCHEMA_VERSION - 1 }))).toBe(false);
  });
});

describe('1 -> 2: state, queries and typed handlers', () => {
  /**
   * A document exactly as Phase 8 and 9 stored it: no `state`, no `queries`, and no
   * `symbols` either — so every case here also walks the whole chain to the current
   * version rather than only the one step it is about.
   */
  function schema1(): Record<string, unknown> {
    const doc = cloneJson(makeDoc()) as unknown as {
      schemaVersion: number;
      pages: Record<string, unknown>[];
      symbols?: unknown;
    };
    doc.schemaVersion = 1;
    delete doc.symbols;
    for (const page of doc.pages) {
      delete page['state'];
      delete page['queries'];
    }
    return doc as unknown as Record<string, unknown>;
  }

  it('gives every page the two new collections', () => {
    const migrated = migrateDoc(schema1());

    expect(migrated.schemaVersion).toBe(DOC_SCHEMA_VERSION);
    expect(migrated.pages[0]?.state).toEqual([]);
    expect(migrated.pages[0]?.queries).toEqual([]);
  });

  it('leaves a page that somehow already had them alone', () => {
    const raw = schema1() as { pages: Record<string, unknown>[] };
    raw.pages[0]!['state'] = [{ id: 's1', name: 'count', type: 'number', initial: 0 }];

    expect(migrateDoc(raw).pages[0]?.state).toEqual([
      { id: 's1', name: 'count', type: 'number', initial: 0 },
    ]);
  });

  it('drops handler steps that are not action steps, rather than failing the document', () => {
    // Schema 1 typed `events` as `unknown[]`, so nothing stopped a value like this being
    // stored. Nothing ever wrote one — there was no editor — but the document has to
    // open either way: `ProjectDocSchema` runs after the migration and would reject the
    // whole project over one malformed step.
    const raw = schema1() as { pages: { nodes: Record<string, Record<string, unknown>> }[] };
    raw.pages[0]!.nodes['root']!['events'] = {
      onClick: [{ kind: 'wat' }, { kind: 'toggleState', stateId: 's1' }],
      onFocus: [{ nonsense: true }],
    };

    const node = migrateDoc(raw).pages[0]?.nodes['root'];

    expect(node?.events).toEqual({ onClick: [{ kind: 'toggleState', stateId: 's1' }] });
  });

  it('changes nothing else about a node', () => {
    // The two optional additions to `Node` — `repeat` and `showIf` — are satisfied by an
    // old document not having them, so a migrated node must come back byte-identical
    // apart from its events.
    const raw = schema1() as { pages: { nodes: Record<string, Record<string, unknown>> }[] };
    const before = cloneJson(raw.pages[0]!.nodes['root']!);

    expect(migrateDoc(raw).pages[0]?.nodes['root']).toEqual(before);
  });
});

describe('2 -> 3: reusable user components', () => {
  /** A document as Phase 11 stored it: pages with state and queries, but no `symbols`. */
  function schema2(): Record<string, unknown> {
    const doc = cloneJson(makeDoc()) as unknown as { schemaVersion: number; symbols?: unknown };
    doc.schemaVersion = 2;
    delete doc.symbols;
    return doc as unknown as Record<string, unknown>;
  }

  it('gives the document the collection, so no reader has to write `?? []`', () => {
    const migrated = migrateDoc(schema2());

    expect(migrated.schemaVersion).toBe(DOC_SCHEMA_VERSION);
    expect(migrated.symbols).toEqual([]);
  });

  it('leaves a document that already has symbols alone', () => {
    const raw = schema2();
    raw['symbols'] = [
      {
        id: 'sym',
        name: 'Card',
        description: '',
        rootId: 'r',
        props: [],
        nodes: {
          r: {
            id: 'r',
            parentId: null,
            type: 'Box',
            name: 'Root',
            children: [],
            props: {},
            styles: {},
            events: {},
          },
        },
      },
    ];

    expect(migrateDoc(raw).symbols).toHaveLength(1);
  });

  it('changes nothing about the pages', () => {
    const raw = schema2() as { pages: unknown[] };
    const before = cloneJson(raw.pages);

    expect(migrateDoc(raw).pages).toEqual(before);
  });
});

describe('3 -> 4: a query names its request kind', () => {
  /** A document as Phase 12 stored it: queries with flat `method`/`url` fields. */
  function schema3(queries: unknown[]): Record<string, unknown> {
    const doc = cloneJson(makeDoc()) as unknown as {
      schemaVersion: number;
      pages: { queries: unknown[] }[];
    };
    doc.schemaVersion = 3;
    doc.pages[0]!.queries = queries;
    return doc as unknown as Record<string, unknown>;
  }

  const flat = {
    id: 'q1',
    name: 'users',
    method: 'POST',
    url: '/api/users?q={{ state.search }}',
    headers: { 'X-Tenant': 'acme' },
    body: '{"a":1}',
    runOnLoad: true,
  };

  it('moves the request under `source` and keeps every part of it', () => {
    const migrated = migrateDoc(schema3([flat]));

    expect(migrated.schemaVersion).toBe(DOC_SCHEMA_VERSION);
    expect(migrated.pages[0]?.queries[0]).toEqual({
      id: 'q1',
      name: 'users',
      runOnLoad: true,
      source: {
        kind: 'url',
        method: 'POST',
        url: '/api/users?q={{ state.search }}',
        headers: { 'X-Tenant': 'acme' },
        body: '{"a":1}',
      },
    });
  });

  /** Absent optional fields must stay absent — see the ops test that asserts the same. */
  it('does not invent headers or a body that were never there', () => {
    const migrated = migrateDoc(
      schema3([{ id: 'q1', name: 'users', method: 'GET', url: '/u', runOnLoad: false }]),
    );
    const source = migrated.pages[0]?.queries[0]?.source;

    expect(source).toEqual({ kind: 'url', method: 'GET', url: '/u' });
    expect(source && 'headers' in source).toBe(false);
    expect(source && 'body' in source).toBe(false);
  });

  it('defaults a missing method rather than dropping the query', () => {
    const migrated = migrateDoc(schema3([{ id: 'q1', name: 'users', url: '/u', runOnLoad: true }]));

    expect(migrated.pages[0]?.queries[0]?.source).toMatchObject({ kind: 'url', method: 'GET' });
  });

  /**
   * One malformed row must not make a whole project un-openable — `ProjectDocSchema` runs
   * after every migration, so a query that cannot be read has to go rather than fail it.
   */
  it('drops a query it cannot read instead of failing the document', () => {
    const migrated = migrateDoc(schema3([flat, { id: 'q2', name: 'broken', runOnLoad: true }]));

    expect(migrated.pages[0]?.queries).toHaveLength(1);
    expect(migrated.pages[0]?.queries[0]?.id).toBe('q1');
  });

  it('leaves a query that already names its source alone', () => {
    const already = {
      id: 'q1',
      name: 'users',
      runOnLoad: true,
      source: { kind: 'integration', integrationId: 'int1', endpointId: 'ep1' },
    };

    expect(migrateDoc(schema3([already])).pages[0]?.queries[0]).toEqual(already);
  });

  it('changes nothing else about the page', () => {
    const raw = schema3([flat]) as { pages: { nodes: unknown; state: unknown }[] };
    const before = cloneJson(raw.pages[0]!.nodes);

    expect(migrateDoc(raw).pages[0]?.nodes).toEqual(before);
  });
});
