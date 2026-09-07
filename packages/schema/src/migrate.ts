/**
 * Document migrations — the mitigation for "doc schema churn breaking saved projects"
 * in PLAN.md §13.
 *
 * Every stored document carries the `schemaVersion` it was written at, and every read
 * runs it through here before anything else looks at it. That makes a change to the
 * document model a two-step edit — change the types, add the migration — rather than a
 * choice between never changing them and losing everyone's work.
 *
 * Migrations are keyed by the version they upgrade *from* and are pure, so a chain of
 * them is testable against a fixture without a database.
 */

import { ActionStepSchema, DOC_SCHEMA_VERSION, ProjectDocSchema, type ProjectDoc } from './doc.js';

/** A raw document as it came out of storage — not yet known to match the current types. */
type RawDoc = Record<string, unknown>;

function isRecord(value: unknown): value is RawDoc {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Schema 2 typed `Node.events` as `ActionStep[]`, where schema 1 had `unknown[]`.
 *
 * In practice every stored document has `events: {}` — nothing could write one before
 * Phase 11 gave the studio an editor for them — so this filter should never drop
 * anything. It exists because the alternative is that one malformed row makes a project
 * un-openable: `ProjectDocSchema` runs after every migration, and a step that does not
 * parse would fail the whole document rather than the handler it came from.
 */
function cleanEvents(events: unknown): Record<string, unknown[]> {
  if (!isRecord(events)) return {};

  const out: Record<string, unknown[]> = {};
  for (const [event, steps] of Object.entries(events)) {
    if (!Array.isArray(steps)) continue;
    const kept = steps.filter((step) => ActionStepSchema.safeParse(step).success);
    if (kept.length > 0) out[event] = kept;
  }
  return out;
}

/**
 * 1 -> 2: page-scoped state and queries, and typed event handlers (PLAN.md §10).
 *
 * The two new page fields are required rather than optional, so this fills them in for
 * every document written before Phase 11. Nothing else moves: `repeat` and `showIf`
 * arrived on `Node` as optional fields, which an old document satisfies by not having
 * them.
 */
function toSchema2(doc: RawDoc): RawDoc {
  const pages = Array.isArray(doc['pages']) ? doc['pages'] : [];

  return {
    ...doc,
    pages: pages.map((page) => {
      if (!isRecord(page)) return page;

      const nodes = page['nodes'];
      const migratedNodes = isRecord(nodes)
        ? Object.fromEntries(
            Object.entries(nodes).map(([id, node]) => [
              id,
              isRecord(node) ? { ...node, events: cleanEvents(node['events']) } : node,
            ]),
          )
        : nodes;

      return {
        ...page,
        nodes: migratedNodes,
        state: Array.isArray(page['state']) ? page['state'] : [],
        queries: Array.isArray(page['queries']) ? page['queries'] : [],
      };
    }),
  };
}

/**
 * 2 -> 3: reusable user components (PLAN.md §12).
 *
 * `ProjectDoc.symbols` is required rather than optional, for the reason `Page.state` was:
 * optional would make this migration a no-op and leave every reader writing `?? []`
 * forever, which is the half-valid shape this module exists to prevent. Nothing else
 * moves — a symbol instance is a `Node` with a namespaced `type`, and no document written
 * before this can contain one.
 */
function toSchema3(doc: RawDoc): RawDoc {
  return { ...doc, symbols: Array.isArray(doc['symbols']) ? doc['symbols'] : [] };
}

/** `n` upgrades a document written at version `n` to version `n + 1`. */
const MIGRATIONS: Record<number, (doc: RawDoc) => RawDoc> = {
  1: toSchema2,
  2: toSchema3,
};

export class DocMigrationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DocMigrationError';
  }
}

/**
 * Brings a stored document up to {@link DOC_SCHEMA_VERSION} and validates it.
 *
 * Throws rather than repairing: a document that cannot be migrated is a bug in a
 * migration or a corrupted row, and either way, quietly handing back a half-valid
 * document would turn one bad save into a broken project. The caller decides whether
 * that is a 500 or a "this project could not be opened".
 */
export function migrateDoc(raw: unknown): ProjectDoc {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DocMigrationError('The stored document is not an object.');
  }

  let current = raw as RawDoc;
  const stored = current['schemaVersion'];

  if (typeof stored !== 'number' || !Number.isInteger(stored) || stored < 1) {
    throw new DocMigrationError(`The stored document has no usable schemaVersion.`);
  }

  if (stored > DOC_SCHEMA_VERSION) {
    // Written by a newer deploy than this one. Guessing at a downgrade is how documents
    // lose data silently; saying so is the only safe answer.
    throw new DocMigrationError(
      `This document was saved by a newer version of the editor (schema ${stored}, this build understands ${DOC_SCHEMA_VERSION}).`,
    );
  }

  for (let version = stored; version < DOC_SCHEMA_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      throw new DocMigrationError(`No migration from document schema ${version}.`);
    }
    current = { ...migrate(current), schemaVersion: version + 1 };
  }

  const parsed = ProjectDocSchema.safeParse(current);
  if (!parsed.success) {
    throw new DocMigrationError('The stored document does not match the current model.', {
      cause: parsed.error,
    });
  }

  return parsed.data;
}

/** True when a document is already at the current version — no migration would run. */
export function isCurrentSchema(doc: ProjectDoc): boolean {
  return doc.schemaVersion === DOC_SCHEMA_VERSION;
}
