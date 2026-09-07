/**
 * What an expression field can offer, and where in the text it would go — PLAN.md §10.
 *
 * Kept out of React for the reason the rest of the studio's logic is: "which names are
 * in scope here" and "what is the caret sitting on" are questions with right answers,
 * and answering them in a component means the only way to check one is to drive a
 * browser.
 *
 * The suggestions are *names*, never a rewrite. Nothing in this repository rewrites
 * expression text (see `expr.ts`) — completing `state.co` to `state.count` inserts what
 * the user was going to type anyway, and a rename afterwards leaves it alone.
 */

import { ACTION_SCOPE_ROOTS, type Page, type SymbolDef } from '@ui-builder/schema';

/** The parts of a query an expression actually reads. */
const QUERY_FIELDS = ['data', 'loading', 'error'] as const;

export interface SuggestionOptions {
  /** Handler fields see the event; render-time fields (a prop, `showIf`) do not. */
  event?: boolean;
  /** `item` and `index` exist only inside a `repeat`. */
  item?: boolean;
  /**
   * The component being edited, when the surface is one.
   *
   * Inside a symbol the scope is its props and the theme — not `state` and not `queries`,
   * which belong to whatever page an instance was dropped on and are empty here (§12).
   * Offering them would be offering names that resolve to nothing.
   */
  symbol?: SymbolDef | null;
}

/**
 * Every path worth offering on this surface, in the order they are useful.
 *
 * The surface's own names come first because they are what someone is reaching for; the
 * bare roots come last so `state` is still completable on its own, which is how you
 * discover what a page has when the list is long.
 */
export function scopeSuggestions(page: Page, options: SuggestionOptions = {}): string[] {
  const paths: string[] = [];
  const inSymbol = options.symbol != null;

  if (inSymbol) {
    for (const prop of options.symbol!.props) paths.push(`props.${prop.name}`);
  } else {
    for (const variable of page.state) paths.push(`state.${variable.name}`);

    for (const query of page.queries) {
      for (const field of QUERY_FIELDS) paths.push(`queries.${query.name}.${field}`);
    }
  }

  if (options.item) paths.push('item', 'index');
  if (options.event) paths.push('event.target.value', 'event.target.checked');

  for (const root of ACTION_SCOPE_ROOTS) {
    if (root === 'event' && !options.event) continue;
    if ((root === 'item' || root === 'index') && !options.item) continue;
    // The two the surface decides between. A page has no enclosing component and a
    // component cannot reach the page's data, so each offers one and not the other.
    if (root === 'props' && !inSymbol) continue;
    if ((root === 'state' || root === 'queries') && inSymbol) continue;
    paths.push(root);
  }

  return [...new Set(paths)];
}

/** The stretch of text a completion would replace. */
export interface CompletionTarget {
  /** What has been typed so far — `state.co`. Empty right after `{{`. */
  token: string;
  from: number;
  to: number;
}

/** A dotted path, or the start of one. Nothing else can be completed. */
const PATH_TAIL = /[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]*)*$|$/;

/**
 * The path being typed at the caret, when the caret is inside a hole.
 *
 * Outside a hole there is nothing to complete: the text around an expression is literal
 * content, and offering `state.count` while someone types a button label would be noise.
 * A hole that has not been closed yet still counts — that is exactly when completing is
 * worth something.
 */
export function completionAt(source: string, caret: number): CompletionTarget | null {
  const before = source.slice(0, caret);

  const open = before.lastIndexOf('{{');
  if (open === -1) return null;
  // A `}}` between the last `{{` and the caret means that hole is already behind us.
  if (before.indexOf('}}', open + 2) !== -1) return null;

  const token = PATH_TAIL.exec(before.slice(open + 2))?.[0] ?? '';
  return { token, from: caret - token.length, to: caret };
}

/** The suggestions worth showing for what has been typed, best first. */
export function matchSuggestions(
  suggestions: readonly string[],
  token: string,
  limit = 8,
): string[] {
  const needle = token.toLowerCase();

  // An empty token offers everything — that is the "what does this page have?" case.
  const matches = suggestions.filter((path) => path.toLowerCase().startsWith(needle));

  // A path already typed in full is not a suggestion, it is the answer.
  return matches.filter((path) => path.toLowerCase() !== needle).slice(0, limit);
}

export interface Completion {
  text: string;
  caret: number;
}

/** The source with the typed path replaced by the chosen one. */
export function applyCompletion(
  source: string,
  target: CompletionTarget,
  choice: string,
): Completion {
  const text = source.slice(0, target.from) + choice + source.slice(target.to);
  return { text, caret: target.from + choice.length };
}
