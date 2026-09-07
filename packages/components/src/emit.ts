/**
 * Emit templates — the shape a component takes in exported code (PLAN.md §11, D7).
 *
 * A component's React implementation is one rendering of its node; the exported
 * project is another. This file is the vocabulary the second one is written in, so
 * that the description of what a `Button` exports as lives in `Button.tsx` next to the
 * `Button` that renders it, rather than in a code generator that keeps its own parallel
 * list of what every component looks like.
 *
 * It is deliberately *data* and not a function. Three consumers generate code — the
 * studio's code panel in the browser, the API's zip route in Node, and the snapshot
 * tests — and a template that is inert data behaves identically in all three, is
 * comparable in a test, and cannot smuggle a closure over something only one of them
 * has. Where a value genuinely has to be computed (a name reduced to initials, a
 * newline-authored option list expanded to `<option>`s) the template names a transform
 * and `@ui-builder/codegen` owns the one implementation of it.
 *
 * Everything here resolves at generation time, because a Phase 10 document holds only
 * `static` props: a condition is decided while emitting and the branch that loses is
 * simply not written. Phase 11's expressions are what turn these into conditionals in
 * the output, and the template shape does not have to change for that — only the
 * resolver behind it.
 */

/**
 * A value bound into an attribute or a run of text.
 *
 * A bare string is a literal, which is the common case and would otherwise be
 * `{ const: 'button' }` on nearly every element in the library.
 *
 * The coercions mirror `asString`/`asNumber`/`asEnum`/`asBoolean` in `spec.ts` exactly,
 * for the same reason they exist there: a stored document can be older than this file,
 * and an unknown `align` has to emit as the default rather than as an attribute
 * selector that matches nothing.
 */
export type EmitValue =
  | string
  | { const: string | number | boolean }
  /**
   * `fallback` stands in when the prop is absent or not a string, matching `asString`.
   * `orElse` stands in when the *resolved* string is empty, matching `asString(x) || y`
   * — the difference decides whether clearing a field in the inspector shows an empty
   * element (Text) or a placeholder (Image), and both are deliberate.
   */
  | { prop: string; as: 'string'; fallback?: string; orElse?: string }
  /**
   * `round` defaults to true because the first number prop in the library was a row
   * count, and a coercion here mirrors what the component itself does — `Textarea`
   * rounds, so this rounds. A component whose numbers are measurements rather than
   * counts (`Slider`) turns it off, and its own `asNumber` does not round either.
   */
  | { prop: string; as: 'number'; fallback: number; min?: number; round?: boolean }
  | { prop: string; as: 'enum'; options: readonly string[]; fallback: string }
  | { prop: string; as: 'boolean'; default?: boolean }
  /**
   * An attribute that is present or absent rather than true or false — `data-wrap`,
   * `data-disabled`, `rel`. `on` is the value it takes when it is present; the
   * attribute is omitted entirely when it is not, which is what the `:where([data-…])`
   * rules in `css.ts` are written against.
   *
   * `equals` switches the test from "this boolean prop is true" to "this enum prop
   * holds this value", which is how one `target: 'blank'` puts both `target="_blank"`
   * and `rel="noreferrer noopener"` on a Link.
   */
  | { prop: string; as: 'flag'; on: string; equals?: string; default?: boolean }
  /** 'Ada Lovelace' -> 'AL'. The Avatar fallback. */
  | { prop: string; as: 'initials' }
  /** The first character, uppercased, falling back to another value's. */
  | { prop: string; as: 'initial'; or?: EmitValue };

/**
 * Whether an element is emitted at all.
 *
 * `set` is "this string prop is non-empty" — the test that decides whether an Avatar
 * shows its image or its initials, and whether a Switch draws a label at all.
 */
export type EmitCondition =
  | { prop: string; when: 'set' }
  | { prop: string; when: 'unset' }
  | { prop: string; when: 'true'; default?: boolean }
  | { prop: string; when: 'isNot'; value: string; options: readonly string[]; fallback: string }
  | { all: EmitCondition[] }
  /**
   * The `all` counterpart — "any of these". A Header's brand is a logo *or* a wordmark,
   * and the link wrapping them has to disappear only when both are cleared; without
   * this it would stay as an empty anchor holding a flex gap open.
   */
  | { any: EmitCondition[] }
  /**
   * The negation, which completes the boolean set rather than adding a `when: 'false'`
   * beside `when: 'true'`: a `Table` emits one `<tbody>` when its rows reorder and a
   * different one when they do not, and those two elements want to state the *same*
   * condition, once affirmed and once denied, rather than two conditions a later edit
   * could leave disagreeing.
   */
  | { not: EmitCondition };

/**
 * `prefix` is what makes Heading's level an element name: `h` + `2`. A tag that is
 * chosen by a prop is rare enough that this is the only form of it, and important
 * enough to support — a heading that looks like an h2 and exports as a div is exactly
 * the kind of thing this codebase should make impossible rather than discourage.
 */
export type EmitTag =
  | string
  | { prop: string; as: 'enum'; options: readonly string[]; fallback: string; prefix?: string };

/**
 * An attribute whose presence depends on something a single coercion cannot express.
 *
 * Only `Select` needs it today — its muted `data-placeholder` is on when there is no
 * selection *and* there is a prompt to show — but the alternative was widening `flag`
 * with a second prop, which would put a two-prop test inside a value that reads like a
 * one-prop one.
 */
export type EmitAttr = EmitValue | { when: EmitCondition; value: EmitValue };

/**
 * A module the exported project ships so that an element can be a *component* rather than
 * an intrinsic tag — the mechanism `codegen.importFrom` was always reserved for.
 *
 * Almost everything in this library exports as static markup, which is the whole reason
 * the templates are inert data. A row someone can drag into a new order is the exception:
 * it needs state and event handlers, and no amount of template vocabulary describes those
 * without becoming a programming language.
 *
 * So the escape hatch is deliberately narrow. A module named here must be a **wrapper**:
 * it takes the markup the template already produced as its children and adds behaviour to
 * it, never markup of its own. That is what keeps D6 — the canvas and the export render
 * the same elements because they come from the same template, and the module only decides
 * what order they sit in and what happens when one is dragged.
 *
 * `source` is a string for `css.ts`'s reason: it has to reach the studio's code panel in
 * the browser, the API's zip route in Node and a snapshot test, and a plain string is the
 * only form all three can take. Its React twin lives in `react/` under the same name, and
 * the two are the same component written twice — the doc comment on each says so.
 */
export interface EmitModule {
  /** The import binding, and therefore the JSX tag — `SortableRows`. */
  name: string;
  /** Where the file lands in the generated project, forward-slashed from its root. */
  path: string;
  /**
   * How a page module imports it. Stated rather than derived from `path`, because the
   * answer depends on where pages live and this file does not decide that.
   */
  specifier: string;
  /** The file's contents, shipped verbatim. */
  source: string;
}

export type EmitChild =
  | EmitElement
  | { text: EmitValue }
  /** Where the node's own children go. Containers only, and at most one per template. */
  | { slot: true }
  /**
   * Expands a newline-authored option list into `<option>` elements — the transform
   * behind `Select`, whose choices are data typed into a textarea rather than child
   * nodes (§7).
   */
  | { options: { prop: string } }
  /**
   * The same option list expanded into labelled radio inputs — `Radio`.
   *
   * A named transform rather than a general repeat, which is the pattern this file
   * already follows: a template is inert data, and expressing "one labelled input per
   * line, checked when it matches, all sharing a name" generically would need a loop
   * variable that every other template would then have to be able to mention. Each
   * field here names the *prop* the value is read from, not the value.
   */
  | { radios: { options: string; name: string; checked: string; disabled: string } }
  /**
   * The same option list expanded into anchors, one marked as the current page — the
   * link row shared by `SideNav`, `Header` and `Footer`.
   *
   * A third named transform rather than a general repeat, for the reason given above:
   * each field names the *prop* to read, and the shape depends on what was typed.
   *
   * `class` is the class each anchor carries, and it is spelled out rather than defaulted
   * because three components now share this transform and they do not look alike — a
   * footer link is body text, a side-nav item is a filled row. Omitting `active` is how a
   * component says it has no current item at all, which is the Footer: a footer marks
   * where a site goes, not where the reader is.
   */
  | { navItems: { items: string; active?: string; class: string } }
  /**
   * Expands Markdown into the elements it describes — `RichText`.
   *
   * The parse is `parseRichText` in `markdown.ts`, the same one the component renders
   * from, so the exported page is the canvas's tree written out as JSX. It is a
   * transform for the same reason `options` is: the shape depends on the content, and a
   * static template cannot describe "however many headings the author typed".
   */
  | { markdown: { prop: string; fallback?: string } }
  /**
   * The `<tr>` of column headings — `Table`.
   *
   * It takes `rows` as well as `columns` because the width of a table is the widest line
   * in either field (`parseTable`), so a header cannot be expanded without seeing the
   * body. `grip` names the boolean prop that decides whether a leading, empty heading
   * sits above the column of drag handles.
   */
  | { tableHead: { columns: string; rows: string; grip?: string } }
  /**
   * The body `<tr>`s, and — when there are none — the single row that says so.
   *
   * A fourth named transform for the reason the others are: the shape depends on what was
   * typed, and "one cell per column, one row per line, and one `colSpan` row instead when
   * the table is empty" is not something a static template can describe.
   */
  | {
      tableRows: {
        columns: string;
        rows: string;
        grip?: string;
        /** The string prop shown, spanning every column, when there are no rows. */
        empty?: string;
      };
    };

export interface EmitElement {
  tag: EmitTag;
  /**
   * The module that stands in for this element, when it exports as an imported component
   * rather than as its own tag. The generator imports it into the page and ships the file
   * once, however many nodes reach for it.
   *
   * `tag` stays what the element *is* — a `SortableRows` is a `tbody`, and writing that
   * down keeps the template readable as markup — while this says what writes it. The same
   * division as `codegen.tag` against `codegen.emit`.
   */
  from?: EmitModule;
  /**
   * The library class this element carries — `ub-button`, `ub-avatar-image`. It is a
   * plain global class, not a CSS Module one: the sheet it comes from is `css.ts`,
   * which the export ships verbatim so that what the user designed against is byte-for-
   * byte what they ship (D6).
   *
   * The *root* element additionally gets the node's own `ub-n-<id>` class, which the
   * generator adds — a template never names it, because a template does not know which
   * node it is being expanded for.
   */
  class?: string;
  /**
   * Insertion order is emit order, so the generated attributes read in the same order
   * as the component's own JSX and a snapshot diff means a real change.
   */
  attrs?: Record<string, EmitAttr>;
  children?: EmitChild[];
  /** Emitted only when this holds. Absent means always. */
  when?: EmitCondition;
}
