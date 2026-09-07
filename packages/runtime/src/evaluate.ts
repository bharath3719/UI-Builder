/**
 * The evaluator — PLAN.md §10, and the runtime half of §13's expression risk.
 *
 * This is the only module in the repository that turns text a user typed into a running
 * function. `@ui-builder/schema`'s `expr.ts` defines everything about a binding *except*
 * how to run one, precisely so the studio, the API and the code generator can read
 * bindings without being able to execute them; this file is the one place that closes
 * the gap, and it is small enough to read in a sitting on purpose.
 *
 * **Which realm the code runs in.** The canvas renders *through* the frame with a portal
 * (`CanvasFrame`), so the React tree — and therefore this module — executes in the
 * studio's realm even though the DOM lands in the frame's. Compiling with the ambient
 * `Function` would put user code in the studio's global scope, which is what §13 says not
 * to do, so a compile takes the realm to compile in: `frame.contentWindow`, whose
 * `Function` produces functions whose globals are the frame's.
 *
 * Be honest about what that buys. The frame is same-origin — it has to be, or the portal
 * could not reach its document — so `parent` is reachable from inside an expression and
 * this is a footgun boundary, not a security one. What it does do is make `location`,
 * `document` and `history` mean *the design's*, which is what an author would expect
 * them to mean, and keep a runaway expression out of the studio's own globals. A
 * `sandbox` attribute would be the real boundary and would cost the portal, which is the
 * thing that makes one React tree and one undo stack possible.
 *
 * **Why named parameters and not `with(scope)`.** The scope's roots are a closed set, so
 * they can be the compiled function's parameters. That is faster, needs no `with`, and —
 * the reason that matters — resolves names exactly the way the generated code will, where
 * `state` and `item` are real bindings in the component and the `.map()` callback. `with`
 * would consult a prototype chain that the export has no equivalent of, which is a way
 * for the canvas and the export to disagree about one expression (D6).
 */

import { ACTION_SCOPE_ROOTS, type ActionScope, type EvaluateExpression } from '@ui-builder/schema';

/**
 * Anything carrying a `Function` constructor — in practice an iframe's `contentWindow`,
 * and `globalThis` when there is no frame (a test, or a preview that has not mounted its
 * document yet).
 */
export interface EvalRealm {
  Function: FunctionConstructor;
}

/** One expression that would not compile or would not run, and why. */
export interface ExpressionError {
  source: string;
  message: string;
}

export type ReportExpressionError = (error: ExpressionError) => void;

export interface EvaluatorOptions {
  /** Where to compile. Defaults to the ambient realm; the canvas passes the frame's. */
  realm?: EvalRealm | null;
  /** Called instead of throwing. See `createEvaluator` for why those differ. */
  report?: ReportExpressionError;
}

type Compiled = { ok: true; run: (...args: unknown[]) => unknown } | { ok: false; message: string };

/**
 * Compiled functions, per realm and per source.
 *
 * Keyed by realm first because a function compiled in the studio's realm is not the same
 * function as one compiled in the frame's, and the canvas mounts before its frame's
 * document exists — so both keys really do occur for the same expression.
 */
const caches = new WeakMap<EvalRealm, Map<string, Compiled>>();

/**
 * Every keystroke in an expression field is a distinct source string, so the cache grows
 * with typing rather than with the document. Clearing it wholesale is the right response:
 * a miss costs one compile, and the entries that still matter are recreated by the next
 * render.
 */
const CACHE_LIMIT = 500;

function cacheFor(realm: EvalRealm): Map<string, Compiled> {
  const existing = caches.get(realm);
  if (existing) return existing;

  const cache = new Map<string, Compiled>();
  caches.set(realm, cache);
  return cache;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compile(source: string, kind: 'expression' | 'statements', realm: EvalRealm): Compiled {
  const cache = cacheFor(realm);
  const key = `${kind}:${source}`;

  const hit = cache.get(key);
  if (hit) return hit;

  let compiled: Compiled;
  try {
    // The newlines are load-bearing: without the one before `)`, an expression ending in
    // a line comment would comment out the paren that closes it. `"use strict"` stops an
    // assignment to an undeclared name from creating a global, and matches the module
    // scope the generated code runs in.
    const body =
      kind === 'expression'
        ? `"use strict";\nreturn (\n${source}\n);`
        : `"use strict";\n${source}\n`;

    compiled = {
      ok: true,
      run: new realm.Function(...ACTION_SCOPE_ROOTS, body) as (...args: unknown[]) => unknown,
    };
  } catch (error) {
    // A syntax error. Held in the cache like any other result so that a broken field is
    // not recompiled on every frame of every render while it is being typed.
    compiled = { ok: false, message: messageOf(error) };
  }

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, compiled);
  return compiled;
}

/** The scope, flattened into the argument list the compiled function declares. */
function argumentsFor(scope: ActionScope): unknown[] {
  return ACTION_SCOPE_ROOTS.map((root) => scope[root]);
}

/**
 * An evaluator bound to one scope.
 *
 * Failures are reported and yield `undefined` rather than throwing, because this is
 * called *during render* — a throw would take the node down through its error boundary,
 * and a half-typed expression in one prop would blank a whole card. The node keeps
 * rendering with that prop unset and wears a badge instead (`PageRenderer`).
 *
 * `runStatements` is the opposite for the same reason inverted: it runs inside a handler,
 * where a throw stops the rest of the sequence, which is what the author's own code would
 * do in the export.
 */
export function createEvaluator(
  scope: ActionScope,
  { realm, report }: EvaluatorOptions = {},
): EvaluateExpression {
  const host = realm ?? globalThis;
  const args = argumentsFor(scope);

  return (source: string): unknown => {
    const compiled = compile(source, 'expression', host);
    if (!compiled.ok) {
      report?.({ source, message: compiled.message });
      return undefined;
    }

    try {
      return compiled.run(...args);
    } catch (error) {
      report?.({ source, message: messageOf(error) });
      return undefined;
    }
  };
}

/**
 * Runs a `custom` action step: statements, not an expression, evaluated as written.
 *
 * Throws on a syntax error as well as on a runtime one, so that both reach the caller
 * that knows which step it was (`runSteps`) and can say so.
 */
export function runStatements(source: string, scope: ActionScope, realm?: EvalRealm | null): void {
  const compiled = compile(source, 'statements', realm ?? globalThis);
  if (!compiled.ok) throw new Error(compiled.message);
  compiled.run(...argumentsFor(scope));
}
