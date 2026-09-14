/**
 * The component library's stylesheet, as a string.
 *
 * Not a CSS Module, on purpose. This text has to reach three places that no bundler
 * sees into: the canvas iframe (injected into a `<style>` at runtime), the standalone
 * preview, and the exported project. A plain string is the only form all three can
 * take, and it means the CSS the user ships is byte-identical to the CSS they
 * designed against — D6, the same reasoning as `serializeNodeStyles`.
 *
 * The design is shadcn/ui's: its geometry (h-9 controls, 8px radii, the same
 * paddings), its variant taxonomy, and its token names, written against the custom
 * properties `serializeTheme` emits. Opacity-modified colours use `color-mix` where
 * shadcn writes `bg-primary/90`, so a single token stays the source of the colour.
 *
 * Every selector here weighs exactly one class, so a rule the inspector writes for a
 * node (`.ub-n-<id>`) always wins on source order — the library is loaded first.
 * Keeping that true is what `:where()` around each `[data-*]` is for: a variant rule
 * written as `.ub-stack[data-direction='vertical']` would out-specify the node's own
 * class and silently beat the Design tab, so the attribute is held at zero weight.
 * These rules state a component's *defaults*, and `:where()` is how CSS says that.
 *
 * Anything added here must follow the same rule — one class of weight, no nesting,
 * no `!important` — or the inspector stops working for that component with no error.
 */

/**
 * The chart's categorical palette — the same six colours the `.ub-chart` block below
 * declares, as data.
 *
 * Exported because the inspector offers them: a palette control that starts from six
 * blanks asks the author to invent a colour scheme, and one that starts from the chart's
 * own asks them to adjust it. Written out here rather than interpolated into the
 * stylesheet so that block still reads as the CSS it ships as; `css.test.ts` is what
 * keeps the two from drifting.
 *
 * The first is the theme's own primary, so a single-series chart is the page's colour
 * without anything being chosen. The rest are a hue ramp around it.
 */
export const CHART_PALETTE: readonly string[] = [
  'var(--primary)',
  'hsl(199 89% 48%)',
  'hsl(160 60% 39%)',
  'hsl(43 96% 48%)',
  'hsl(280 55% 58%)',
  'hsl(346 77% 55%)',
];

/**
 * A palette prop read as the list of colours it holds.
 *
 * Split on the commas *between* colours and not on the ones inside them: `rgb(37, 99,
 * 235)` is one colour, and a list a reader cannot write the commonest colour syntax into
 * is a list that will be written wrong. Depth is what tells the two apart, which also
 * makes `var(--brand, #eee)` survive.
 *
 * The chart has this function too, and has to: its file is shipped whole into an exported
 * project and can import nothing from here. `Chart.test.ts` is what says the two agree.
 */
export function splitPalette(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);

    if (character === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  out.push(current);
  return out.map((colour) => colour.trim()).filter(Boolean);
}

export const COMPONENT_CSS = `
/* --- How a size is written here ----------------------------------------------
   A component's ROOT may size itself in pixels; anything INSIDE one is in em.

   The Design tab writes its declarations onto .ub-n-<id>, which is the root. An
   inheritable property gets to the inner text only by inheritance, and inheritance
   loses to any declaration at all — so a header row saying font-size: 12px did not
   lose a specificity contest with the inspector, it never entered one, and the Size
   field silently did nothing on every component that draws its own text.

   Each em below is the ratio the pixel value already was, against the parent it
   actually has rather than against 16 — .ub-tool-call-state sits inside
   .ub-tool-call-summary, so it is 12/13. Nothing moves at the default size; the
   sizes simply became a scale instead of a set of constants.

   The exception is a component that cannot honour the field whatever the sheet says.
   A chart draws its labels inside a viewBox, where a length is in user units — it
   declares that in ComponentSpec.unsupportedStyles and the field is hidden instead. */

/* --- Canvas reset ------------------------------------------------------------
   The iframe is a fresh document, so the design gets its own reset rather than
   inheriting whatever the studio happens to apply. */

*,
*::before,
*::after {
  box-sizing: border-box;
}

/* Full height, so a root styled min-height:100% actually fills the viewport. Without
   it the percentage resolves against an auto-height body and collapses — on the canvas
   and in the exported page alike, which is why it belongs in the reset rather than in
   the editor's own CSS. */
html,
body {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* --- Box ------------------------------------------------------------------ */

.ub-box {
  display: block;
}

/* --- Stacks ----------------------------------------------------------------
   The two components a builder uses more than every other one combined, so gap,
   alignment and wrapping are first-class props rather than raw CSS the user has
   to reach into the inspector for. */

.ub-stack {
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
}

.ub-stack:where([data-direction='vertical']) {
  flex-direction: column;
}

.ub-stack:where([data-direction='horizontal']) {
  flex-direction: row;
}

.ub-stack:where([data-align='start']) { align-items: flex-start; }
.ub-stack:where([data-align='center']) { align-items: center; }
.ub-stack:where([data-align='end']) { align-items: flex-end; }
.ub-stack:where([data-align='stretch']) { align-items: stretch; }
.ub-stack:where([data-align='baseline']) { align-items: baseline; }

.ub-stack:where([data-justify='start']) { justify-content: flex-start; }
.ub-stack:where([data-justify='center']) { justify-content: center; }
.ub-stack:where([data-justify='end']) { justify-content: flex-end; }
.ub-stack:where([data-justify='between']) { justify-content: space-between; }
.ub-stack:where([data-justify='around']) { justify-content: space-around; }

.ub-stack:where([data-wrap='true']) {
  flex-wrap: wrap;
}

/* --- Gap --------------------------------------------------------------------
   An attribute rule rather than an inline style, for both the stacks and the grid.
   An inline style beats every stylesheet, so a gap written in the inspector's
   Design tab could never take effect on the components people set gap on most.
   These rules lose to the per-node rules emitted after them, which is the ordering
   the whole style system depends on. */

.ub-stack:where([data-gap='0']), .ub-grid:where([data-gap='0']) { gap: var(--space-0); }
.ub-stack:where([data-gap='1']), .ub-grid:where([data-gap='1']) { gap: var(--space-1); }
.ub-stack:where([data-gap='2']), .ub-grid:where([data-gap='2']) { gap: var(--space-2); }
.ub-stack:where([data-gap='3']), .ub-grid:where([data-gap='3']) { gap: var(--space-3); }
.ub-stack:where([data-gap='4']), .ub-grid:where([data-gap='4']) { gap: var(--space-4); }
.ub-stack:where([data-gap='5']), .ub-grid:where([data-gap='5']) { gap: var(--space-5); }
.ub-stack:where([data-gap='6']), .ub-grid:where([data-gap='6']) { gap: var(--space-6); }
.ub-stack:where([data-gap='8']), .ub-grid:where([data-gap='8']) { gap: var(--space-8); }
.ub-stack:where([data-gap='10']), .ub-grid:where([data-gap='10']) { gap: var(--space-10); }
.ub-stack:where([data-gap='12']), .ub-grid:where([data-gap='12']) { gap: var(--space-12); }
.ub-stack:where([data-gap='16']), .ub-grid:where([data-gap='16']) { gap: var(--space-16); }

/* --- Grid -------------------------------------------------------------------
   minmax(0, 1fr) rather than 1fr: a grid item's default min-width is auto, so a
   long unbroken word would otherwise push its own track wider than its share and
   make one card bigger than the rest for no visible reason. */

.ub-grid {
  display: grid;
}

.ub-grid:where([data-columns='1']) { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.ub-grid:where([data-columns='2']) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ub-grid:where([data-columns='3']) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ub-grid:where([data-columns='4']) { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ub-grid:where([data-columns='5']) { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.ub-grid:where([data-columns='6']) { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.ub-grid:where([data-columns='auto']) { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }

/* --- Spacer -----------------------------------------------------------------
   The size is a flex-basis so one component spaces a column and a row alike — the
   basis is always the main axis. min-height repeats it for the case where the
   parent is not a flex container at all, where a basis resolves to nothing and an
   unstyled spacer would be a zero-pixel node nobody can click. */

.ub-spacer {
  flex: 0 0 auto;
}

.ub-spacer:where([data-size='1']) { flex-basis: var(--space-1); min-height: var(--space-1); }
.ub-spacer:where([data-size='2']) { flex-basis: var(--space-2); min-height: var(--space-2); }
.ub-spacer:where([data-size='3']) { flex-basis: var(--space-3); min-height: var(--space-3); }
.ub-spacer:where([data-size='4']) { flex-basis: var(--space-4); min-height: var(--space-4); }
.ub-spacer:where([data-size='6']) { flex-basis: var(--space-6); min-height: var(--space-6); }
.ub-spacer:where([data-size='8']) { flex-basis: var(--space-8); min-height: var(--space-8); }
.ub-spacer:where([data-size='12']) { flex-basis: var(--space-12); min-height: var(--space-12); }
.ub-spacer:where([data-size='16']) { flex-basis: var(--space-16); min-height: var(--space-16); }

.ub-spacer:where([data-grow='true']) {
  flex: 1 1 0;
}

/* --- Divider ---------------------------------------------------------------- */

.ub-divider {
  flex: none;
  border: 0;
  margin: 0;
  background: var(--border);
}

.ub-divider:where([data-orientation='horizontal']) {
  width: 100%;
  height: 1px;
}

.ub-divider:where([data-orientation='vertical']) {
  align-self: stretch;
  width: 1px;
  height: auto;
  min-height: var(--space-4);
}

/* --- Text ------------------------------------------------------------------ */

.ub-text {
  margin: 0;
  line-height: 1.75;
}

.ub-text:where([data-size='sm']) { font-size: 14px; line-height: 1.6; }
.ub-text:where([data-size='base']) { font-size: 16px; line-height: 1.75; }
.ub-text:where([data-size='lg']) { font-size: 18px; line-height: 1.75; }

.ub-text:where([data-tone='default']) { color: var(--foreground); }
.ub-text:where([data-tone='muted']) { color: var(--muted-foreground); }

/* --- Heading ----------------------------------------------------------------
   shadcn's typographic scale, so a heading dropped next to a Button reads as part
   of the same system without anyone opening the inspector. */

.ub-heading {
  margin: 0;
  color: var(--foreground);
  scroll-margin: 20px;
}

.ub-heading:where([data-level='1']) {
  font-size: 36px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.025em;
}

.ub-heading:where([data-level='2']) {
  font-size: 30px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.025em;
}

.ub-heading:where([data-level='3']) {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.ub-heading:where([data-level='4']) {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.01em;
}

/* --- Link ------------------------------------------------------------------- */

.ub-link {
  color: var(--primary);
  font-weight: 500;
  text-underline-offset: 4px;
  transition: color 150ms ease;
}

.ub-link:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.ub-link:where([data-underline='none']) { text-decoration: none; }
.ub-link:where([data-underline='always']) { text-decoration: underline; }
.ub-link:where([data-underline='hover']) { text-decoration: none; }
.ub-link:where([data-underline='hover']):hover { text-decoration: underline; }

/* --- Badge ------------------------------------------------------------------ */

.ub-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}

.ub-badge:where([data-variant='default']) {
  background: var(--primary);
  color: var(--primary-foreground);
}

.ub-badge:where([data-variant='secondary']) {
  background: var(--secondary);
  color: var(--secondary-foreground);
}

.ub-badge:where([data-variant='destructive']) {
  background: var(--destructive);
  color: var(--destructive-foreground);
}

.ub-badge:where([data-variant='outline']) {
  background: transparent;
  color: var(--foreground);
  border-color: var(--border);
}

/* --- Avatar -----------------------------------------------------------------
   overflow: hidden on the wrapper is what makes the image circular, so the image
   and the initials it stands in for are clipped by the same shape. */

.ub-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--muted);
  color: var(--muted-foreground);
  font-weight: 500;
  user-select: none;
}

.ub-avatar:where([data-size='sm']) { width: 32px; height: 32px; font-size: 12px; }
.ub-avatar:where([data-size='default']) { width: 40px; height: 40px; font-size: 14px; }
.ub-avatar:where([data-size='lg']) { width: 56px; height: 56px; font-size: 18px; }

.ub-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ub-avatar-fallback {
  line-height: 1;
  letter-spacing: 0.02em;
}

/* --- Button ---------------------------------------------------------------- */

.ub-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease,
    border-color 150ms ease;
}

.ub-button:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-button:disabled,
.ub-button:where([data-disabled]) {
  pointer-events: none;
  opacity: 0.5;
}

.ub-button:where([data-size='sm']) { height: 32px; padding: 0 12px; font-size: 13px; }
.ub-button:where([data-size='default']) { height: 36px; padding: 0 16px; }
.ub-button:where([data-size='lg']) { height: 40px; padding: 0 32px; }
.ub-button:where([data-size='icon']) { height: 36px; width: 36px; padding: 0; }

.ub-button:where([data-variant='default']) {
  background: var(--primary);
  color: var(--primary-foreground);
}
.ub-button:where([data-variant='default']):hover {
  background: color-mix(in srgb, var(--primary) 90%, transparent);
}

.ub-button:where([data-variant='secondary']) {
  background: var(--secondary);
  color: var(--secondary-foreground);
}
.ub-button:where([data-variant='secondary']):hover {
  background: color-mix(in srgb, var(--secondary) 80%, transparent);
}

.ub-button:where([data-variant='destructive']) {
  background: var(--destructive);
  color: var(--destructive-foreground);
}
.ub-button:where([data-variant='destructive']):hover {
  background: color-mix(in srgb, var(--destructive) 90%, transparent);
}

.ub-button:where([data-variant='outline']) {
  background: var(--background);
  color: var(--foreground);
  border-color: var(--input);
}
.ub-button:where([data-variant='outline']):hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.ub-button:where([data-variant='ghost']) {
  background: transparent;
  color: var(--foreground);
}
.ub-button:where([data-variant='ghost']):hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.ub-button:where([data-variant='link']) {
  background: transparent;
  color: var(--primary);
  text-underline-offset: 4px;
  padding: 0;
  height: auto;
}
.ub-button:where([data-variant='link']):hover {
  text-decoration: underline;
}

/* --- Input ----------------------------------------------------------------- */

.ub-input {
  display: flex;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  background: transparent;
  border: 1px solid var(--input);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  transition: border-color 150ms ease;
}

.ub-input::placeholder {
  color: var(--muted-foreground);
}

.ub-input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -1px;
}

.ub-input:disabled,
.ub-input:where([data-disabled]) {
  cursor: not-allowed;
  opacity: 0.5;
}

/* --- Textarea ---------------------------------------------------------------
   resize: vertical rather than both — a textarea a user can drag wider than its
   own column is a layout bug they did not ask for. */

.ub-textarea {
  display: block;
  width: 100%;
  min-height: 64px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid var(--input);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  transition: border-color 150ms ease;
}

.ub-textarea::placeholder {
  color: var(--muted-foreground);
}

.ub-textarea:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -1px;
}

.ub-textarea:disabled,
.ub-textarea:where([data-disabled]) {
  cursor: not-allowed;
  opacity: 0.5;
}

/* --- Select -----------------------------------------------------------------
   A select cannot carry a pseudo-element, so the chevron has to be a background
   image, and a background image cannot read currentColor. That one glyph is
   therefore the library's only literal colour: it is the muted foreground of the
   default theme, and it is the reason the arrow does not follow a retheme. */

.ub-select {
  display: flex;
  width: 100%;
  height: 36px;
  padding: 0 32px 0 12px;
  appearance: none;
  background-color: transparent;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5 5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  border: 1px solid var(--input);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  cursor: pointer;
  transition: border-color 150ms ease;
}

.ub-select:where([data-placeholder]) {
  color: var(--muted-foreground);
}

.ub-select:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -1px;
}

.ub-select:disabled,
.ub-select:where([data-disabled]) {
  cursor: not-allowed;
  opacity: 0.5;
}

/* --- Multi select ------------------------------------------------------------
   A native <details> whose panel holds real checkboxes. That is what lets a
   multi-select ship with no JavaScript: opening the panel is a browser feature, and
   each choice is a control that submits under the group's one name.

   The field borrows Select's chevron — the same data URI, and the same reason it is
   the library's only literal colour: a background image cannot read currentColor. */

.ub-multiselect {
  position: relative;
  display: block;
  width: 100%;
}

.ub-multiselect:where([data-disabled]) {
  opacity: 0.5;
}

.ub-multiselect-field {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 4px 32px 4px 10px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5 5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  border: 1px solid var(--input);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 14px;
  line-height: 1.5;
  cursor: pointer;
  /* The disclosure triangle, in both spellings. The chevron above stands for it. */
  list-style: none;
}

.ub-multiselect-field::-webkit-details-marker {
  display: none;
}

.ub-multiselect-field:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -1px;
}

.ub-multiselect-placeholder {
  color: var(--muted-foreground);
}

/* Wrapping rather than scrolling: six choices is an ordinary selection, and a field
   that grows says so where one that clips a row does not. */
.ub-multiselect-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.ub-multiselect-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: var(--muted);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: 0.8125em;
  line-height: 1.5;
}

/* Absolute, so the panel covers what follows it instead of pushing the page down —
   the one thing a dropdown has to do that a disclosure does not. */
.ub-multiselect-menu {
  position: absolute;
  z-index: 1;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 220px;
  overflow: auto;
  padding: 4px;
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--foreground) 10%, transparent);
}

.ub-multiselect-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  color: var(--popover-foreground);
  font-size: 14px;
  line-height: 1.4;
  cursor: pointer;
}

.ub-multiselect-option:hover {
  background: var(--muted);
}

/* The Checkbox tick, on a control that is not a Checkbox node — the same appearance:
   none input and the same rotated corner, because a tick that differed between the
   two would read as two different kinds of choice. */
.ub-multiselect-check {
  display: inline-grid;
  place-content: center;
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  appearance: none;
  background: var(--background);
  border: 1px solid var(--input);
  border-radius: var(--radius-sm);
  cursor: inherit;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}

.ub-multiselect-check::before {
  content: '';
  width: 9px;
  height: 5px;
  border-left: 2px solid var(--primary-foreground);
  border-bottom: 2px solid var(--primary-foreground);
  transform: rotate(-45deg) translate(1px, -1px);
  opacity: 0;
}

.ub-multiselect-check:checked {
  background: var(--primary);
  border-color: var(--primary);
}

.ub-multiselect-check:checked::before {
  opacity: 1;
}

.ub-multiselect-check:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-multiselect-label {
  min-width: 0;
}

/* --- Checkbox ---------------------------------------------------------------
   A real input with appearance: none, so the space bar, the focus ring and the
   label association keep working. The tick is a rotated corner of borders rather
   than an image, which is what lets it take a theme colour. */

.ub-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  line-height: 1.4;
  cursor: pointer;
}

.ub-checkbox:where([data-disabled]) {
  cursor: not-allowed;
  opacity: 0.5;
}

.ub-checkbox-input {
  display: inline-grid;
  place-content: center;
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  appearance: none;
  background: var(--background);
  border: 1px solid var(--input);
  border-radius: var(--radius-sm);
  cursor: inherit;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}

.ub-checkbox-input::before {
  content: '';
  width: 9px;
  height: 5px;
  border-left: 2px solid var(--primary-foreground);
  border-bottom: 2px solid var(--primary-foreground);
  transform: rotate(-45deg) translate(1px, -1px);
  opacity: 0;
}

.ub-checkbox-input:checked {
  background: var(--primary);
  border-color: var(--primary);
}

.ub-checkbox-input:checked::before {
  opacity: 1;
}

.ub-checkbox-input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-checkbox-label {
  color: var(--foreground);
}

/* --- Switch ------------------------------------------------------------------ */

.ub-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  line-height: 1.4;
  cursor: pointer;
}

.ub-switch:where([data-disabled]) {
  cursor: not-allowed;
  opacity: 0.5;
}

.ub-switch-input {
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
  margin: 0;
  appearance: none;
  background: var(--input);
  border-radius: var(--radius-full);
  cursor: inherit;
  transition: background-color 150ms ease;
}

.ub-switch-input::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: var(--background);
  border-radius: var(--radius-full);
  transition: transform 150ms ease;
}

.ub-switch-input:checked {
  background: var(--primary);
}

.ub-switch-input:checked::before {
  transform: translateX(16px);
}

.ub-switch-input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-switch-label {
  color: var(--foreground);
}

/* --- Radio group -------------------------------------------------------------
   Real inputs with appearance: none, like the checkbox — the arrow keys move
   between radios of a shared name, and that only works if they are radios. The dot
   is an inset box-shadow rather than a pseudo-element because ::before is already
   how the ring is drawn on a control this small. */

.ub-radio-group {
  display: flex;
  gap: 8px;
}

.ub-radio-group:where([data-orientation='vertical']) {
  flex-direction: column;
}

.ub-radio-group:where([data-orientation='horizontal']) {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16px;
}

.ub-radio-group:where([data-disabled]) {
  cursor: not-allowed;
  opacity: 0.5;
}

.ub-radio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  line-height: 1.4;
  cursor: pointer;
}

.ub-radio-input {
  display: inline-grid;
  place-content: center;
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  appearance: none;
  background: var(--background);
  border: 1px solid var(--input);
  border-radius: var(--radius-full);
  cursor: inherit;
  transition: border-color 150ms ease;
}

.ub-radio-input::before {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--primary);
  border-radius: var(--radius-full);
  transform: scale(0);
  transition: transform 150ms ease;
}

.ub-radio-input:checked {
  border-color: var(--primary);
}

.ub-radio-input:checked::before {
  transform: scale(1);
}

.ub-radio-input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-radio-label {
  color: var(--foreground);
}

/* --- Date -------------------------------------------------------------------
   Input's box, plus the two things a date field needs on top of it. A min-width,
   because a date has a known length and a field narrower than its own digits
   clips them with no scroll to recover — the other text controls degrade
   gracefully at any width and this one does not. And a picker button that dims to
   match: it is a WebKit pseudo-element with no standard equivalent, so Firefox
   shows its own, and only its opacity can be reached because the glyph is an
   image rather than text. Width is left at Input's full-width behaviour so a row
   of fields lines up. */

.ub-date {
  display: inline-flex;
  width: 100%;
  min-width: 180px;
  height: 36px;
  padding: 0 12px;
  background: transparent;
  border: 1px solid var(--input);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  transition: border-color 150ms ease;
}

.ub-date::-webkit-calendar-picker-indicator {
  opacity: 0.5;
  cursor: pointer;
}

.ub-date::-webkit-calendar-picker-indicator:hover {
  opacity: 1;
}

.ub-date:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -1px;
}

.ub-date:disabled,
.ub-date:where([data-disabled]) {
  cursor: not-allowed;
  opacity: 0.5;
}

/* --- Slider ------------------------------------------------------------------
   The track and the thumb are vendor pseudo-elements with no shared syntax, so
   each rule is written twice rather than in a list: one unrecognised selector in a
   comma-separated group drops the whole group in every browser, which would leave
   the slider unstyled in the one that did understand it. */

.ub-slider {
  width: 100%;
  height: 20px;
  margin: 0;
  padding: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.ub-slider::-webkit-slider-runnable-track {
  height: 6px;
  background: var(--secondary);
  border-radius: var(--radius-full);
}

.ub-slider::-moz-range-track {
  height: 6px;
  background: var(--secondary);
  border-radius: var(--radius-full);
}

.ub-slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -5px;
  background: var(--background);
  border: 2px solid var(--primary);
  border-radius: var(--radius-full);
  transition: box-shadow 150ms ease;
}

.ub-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--background);
  border: 2px solid var(--primary);
  border-radius: var(--radius-full);
  transition: box-shadow 150ms ease;
}

.ub-slider:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 4px;
}

.ub-slider:disabled,
.ub-slider:where([data-disabled]) {
  cursor: not-allowed;
  opacity: 0.5;
}

/* --- Rich text ---------------------------------------------------------------
   Every descendant selector is held inside :where(), so the whole block still
   weighs one class and a rule the inspector writes for the node keeps winning on
   source order. Colour is set on as little as possible for the same reason from
   the other direction: a rule that painted every h2 would beat the colour a user
   set on the block, because a direct rule beats inheritance no matter how weak it
   is. Margins, sizes and weights are safe to state; colour is not, so only the two
   places where it carries meaning — a link and a quote — say anything about it. */

.ub-rich-text {
  display: block;
  font-size: 16px;
  line-height: 1.75;
}

.ub-rich-text > :where(*) {
  margin: 0 0 16px;
}

.ub-rich-text :where(h1),
.ub-rich-text :where(h2),
.ub-rich-text :where(h3),
.ub-rich-text :where(h4),
.ub-rich-text :where(h5),
.ub-rich-text :where(h6) {
  margin: 32px 0 12px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.ub-rich-text :where(h1) { font-size: 2.25em; }
.ub-rich-text :where(h2) { font-size: 1.75em; }
.ub-rich-text :where(h3) { font-size: 1.375em; }
.ub-rich-text :where(h4) { font-size: 1.125em; }
.ub-rich-text :where(h5) { font-size: 1em; }
.ub-rich-text :where(h6) { font-size: 0.875em; }

.ub-rich-text :where(ul),
.ub-rich-text :where(ol) {
  padding-left: 24px;
}

.ub-rich-text :where(li) {
  margin: 4px 0;
}

.ub-rich-text :where(a) {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ub-rich-text :where(blockquote) {
  padding-left: 16px;
  border-left: 2px solid var(--border);
  color: var(--muted-foreground);
  font-style: italic;
}

.ub-rich-text :where(code) {
  padding: 2px 5px;
  background: var(--muted);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.875em;
}

.ub-rich-text :where(pre) {
  padding: 16px;
  background: var(--muted);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

/* The padded chip is for an inline span; inside a block it would draw a box around
   every line of the listing. */
.ub-rich-text :where(pre code) {
  padding: 0;
  background: none;
  font-size: 0.875em;
  line-height: 1.6;
}

.ub-rich-text :where(hr) {
  height: 1px;
  border: 0;
  background: var(--border);
}

/* Last in the section, and that is the point. A block's leading and trailing
   margins are the container's business, not the block's, so these have to beat
   the heading rule above — every selector here weighs one class, so the only
   thing that can decide between them is source order. Written earlier, a block
   opening with a heading would still carry its 32px of space above. */
.ub-rich-text > :where(*:first-child) {
  margin-top: 0;
}

.ub-rich-text > :where(*:last-child) {
  margin-bottom: 0;
}

/* --- Card --------------------------------------------------------------------
   The one container that paints itself, so a group of nodes reads as a unit
   without four declarations in the inspector. */

.ub-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.ub-card:where([data-elevated='true']) {
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--foreground) 6%, transparent),
    0 4px 12px color-mix(in srgb, var(--foreground) 8%, transparent);
}

/* --- Table -------------------------------------------------------------------
   shadcn's table: no outer frame, no fill behind the header, just a rule under
   every row. The variants are custom properties set on the table and read by the
   cells, rather than descendant selectors: a rule that qualified .ub-table-cell by
   the variant sitting on its table would weigh two classes and out-specify the
   .ub-n-<id> rule the inspector writes, which is the one thing this whole sheet is
   arranged to prevent. A custom property inherits down to the cell instead, and
   inheritance has no specificity to lose. */

.ub-table {
  --ub-table-cell-x: 12px;
  --ub-table-cell-y: 10px;
  --ub-table-stripe: transparent;

  width: 100%;
  border-collapse: collapse;
  color: var(--foreground);
  font-size: 14px;
  text-align: left;
}

.ub-table:where([data-compact]) {
  --ub-table-cell-x: 10px;
  --ub-table-cell-y: 6px;
}

.ub-table:where([data-striped]) {
  --ub-table-stripe: color-mix(in srgb, var(--muted) 60%, transparent);
}

.ub-table:where([data-bordered]) {
  border: 1px solid var(--border);
}

/* Left-aligned, above the table, and muted: a caption is what the table is called,
   not a title competing with the page's own headings. */
.ub-table-caption {
  padding-bottom: var(--space-3);
  color: var(--muted-foreground);
  font-size: 0.9286em;
  text-align: left;
  caption-side: top;
}

.ub-table-head {
  color: var(--muted-foreground);
}

.ub-table-header {
  padding: var(--ub-table-cell-y) var(--ub-table-cell-x);
  color: inherit;
  font-size: 0.8571em;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  border-bottom: 1px solid var(--border);
}

/* Even rather than odd, counted within the section: the first body row is left on
   the page's own background so the header still reads as the thing above the data. */
.ub-table-row:where(:nth-child(even)) {
  background: var(--ub-table-stripe);
}

.ub-table-row:where([data-dragging]) {
  background: var(--muted);
  opacity: 0.6;
}

.ub-table-cell {
  padding: var(--ub-table-cell-y) var(--ub-table-cell-x);
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.ub-table-empty {
  padding: var(--space-8) var(--ub-table-cell-x);
  color: var(--muted-foreground);
  text-align: center;
}

.ub-table-grip-cell {
  width: 28px;
  padding: 0 0 0 var(--space-2);
  border-bottom: 1px solid var(--border);
}

/* The handle is drawn rather than typed: a glyph would be at the mercy of whatever
   font the exported page ends up with, and this is two dots by three in a gradient
   that any browser can paint. */
.ub-table-grip {
  display: block;
  width: 12px;
  height: 16px;
  padding: 0;
  background-color: transparent;
  background-image: radial-gradient(circle, var(--muted-foreground) 1px, transparent 1.2px);
  background-size: 6px 5px;
  background-position: center;
  border: 0;
  border-radius: var(--radius-sm);
  opacity: 0.5;
  cursor: grab;
  transition: opacity 150ms ease;
}

.ub-table-grip:hover {
  opacity: 1;
}

.ub-table-grip:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  opacity: 1;
}

.ub-table-grip:active {
  cursor: grabbing;
}

/* --- Chart -------------------------------------------------------------------
   The categorical palette lives here rather than in the component, for the reason
   the whole sheet exists: a colour written into the drawing would be a colour the
   Design tab cannot reach and a theme cannot follow. The marks carry data-series
   and pick their fill up from these, so re-theming a chart is re-declaring six
   custom properties on it — which a node rule can do, since these are properties
   rather than selectors and inherit with no specificity to lose (.ub-table above).

   The first is the theme's own primary, so a single-series chart is the page's
   colour without anything being chosen. The rest are a hue ramp around it. The
   same six are exported as CHART_PALETTE above, which the inspector offers as the
   starting point for a chart's own Colours.

   A chart whose author named colours sets --ub-chart-mark on each mark instead,
   where it outranks the [data-series] rules below — that is the one thing the mark
   colours cannot be left to a selector for, since the list is as long as the author
   made it and a stylesheet can only be written for a fixed number of slots. */

.ub-chart {
  --ub-chart-1: var(--primary);
  --ub-chart-2: hsl(199 89% 48%);
  --ub-chart-3: hsl(160 60% 39%);
  --ub-chart-4: hsl(43 96% 48%);
  --ub-chart-5: hsl(280 55% 58%);
  --ub-chart-6: hsl(346 77% 55%);
  /* Axis labels are secondary text, and used to say so by naming --muted-foreground
     outright. That made them the one part of a chart the Design tab's Color could not
     reach: a declaration on the node changed the color property, and nothing in the
     drawing read it. Derived from currentColor instead, the de-emphasis is kept and the
     field works — a chart set to a brand colour gets axis labels in a lighter version of
     it, which is what the person setting it meant. */
  --ub-chart-ink: color-mix(in srgb, currentColor 65%, transparent);

  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 180px;
  color: var(--foreground);
}

/* Fills the box it is given: the viewBox does the scaling, so a chart is sized by
   the Design tab like anything else and never measures itself. */
.ub-chart-plot {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: visible;
}

.ub-chart-empty {
  margin: 0;
  /* The same ink as the axis labels, and for the same reason: it is the chart talking
     about itself rather than showing data, and it follows the node's Color. */
  color: var(--ub-chart-ink);
  font-size: 14px;
  text-align: center;
}

/* Set on the mark, read by the mark: one declaration per series instead of one
   rule per series per shape. */
.ub-chart-bar,
.ub-chart-slice,
.ub-chart-key,
.ub-chart-dot {
  fill: var(--ub-chart-mark, var(--ub-chart-1));
}

.ub-chart-line {
  fill: none;
  stroke: var(--ub-chart-mark, var(--ub-chart-1));
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ub-chart-area {
  fill: var(--ub-chart-mark, var(--ub-chart-1));
  opacity: 0.18;
}

.ub-chart-slice {
  stroke: var(--background);
  stroke-width: 1.5;
}

/* A stack is read as parts of one bar, so its segments need an edge between them and a
   fill that is not see-through — two areas at 18% laid on top of each other are a third
   colour that is in neither of them, and a reader has no way to know which. */
.ub-chart-plot:where([data-stacked]) .ub-chart-area {
  opacity: 0.85;
}

.ub-chart-plot:where([data-stacked]) .ub-chart-bar {
  stroke: var(--background);
  stroke-width: 1;
}

/* A stacked chart is the only one whose numbers are written *on* a mark rather than
   beside one, and the mark is whatever colour its series is — so a fill that reads on
   the page reads on some of them and vanishes on the rest. The halo is what makes the
   one colour work on all six: the text keeps the page's ink and carries the page's
   background around it, the way a map label crosses a coastline. */
.ub-chart-plot:where([data-stacked]) .ub-chart-value {
  paint-order: stroke;
  stroke: var(--background);
  stroke-width: 2.5px;
  stroke-linejoin: round;
}

.ub-chart :where([data-series='0']) {
  --ub-chart-mark: var(--ub-chart-1);
}

.ub-chart :where([data-series='1']) {
  --ub-chart-mark: var(--ub-chart-2);
}

.ub-chart :where([data-series='2']) {
  --ub-chart-mark: var(--ub-chart-3);
}

.ub-chart :where([data-series='3']) {
  --ub-chart-mark: var(--ub-chart-4);
}

.ub-chart :where([data-series='4']) {
  --ub-chart-mark: var(--ub-chart-5);
}

.ub-chart :where([data-series='5']) {
  --ub-chart-mark: var(--ub-chart-6);
}

/* What a cross-filter looks like from the chart that caused it. Dimmed rather than
   hidden: the reader has to be able to see what the rest of the series was, or the
   click has thrown away the comparison they were making. */
.ub-chart-bar:where([data-dim]),
.ub-chart-slice:where([data-dim]),
.ub-chart-key:where([data-dim]),
.ub-chart-dot:where([data-dim]),
.ub-chart-value:where([data-dim]),
.ub-chart-label:where([data-dim]) {
  opacity: 0.3;
}

.ub-chart-grid {
  stroke: var(--border);
  stroke-width: 1;
}

/* The zero line is an axis, not a gridline, and reads as one. */
.ub-chart-grid:where([data-zero]) {
  stroke: var(--muted-foreground);
  opacity: 0.5;
}

.ub-chart-label {
  fill: var(--ub-chart-ink);
  font-size: 9px;
}

/* currentColor rather than --foreground, for the reason --ub-chart-ink is: these are the
   numbers written on the chart, and they are the first thing a person recolouring one
   expects to follow. Full strength, unlike the axis labels — a value is the reading, not
   the scaffolding around it. */
.ub-chart-value {
  fill: currentColor;
  font-size: 9px;
  font-weight: 600;
}

.ub-chart-total {
  fill: currentColor;
  font-size: 18px;
  font-weight: 600;
  dominant-baseline: middle;
}

/* Only drawn when the chart was actually wired to something, so the cursor and the
   focus ring are never a promise the page cannot keep. */
.ub-chart-hit {
  cursor: pointer;
}

.ub-chart-hit:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* --- Side nav ----------------------------------------------------------------
   A column of links with the current one filled in. The fill is the muted surface
   rather than the primary: a nav marks where you are, and a whole item in the
   primary colour competes with the one button on the page that is meant to be
   pressed. The width comes from the spec's defaultStyles, not from here, so it is
   a number the inspector owns. */

.ub-side-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ub-side-nav-title {
  padding: 6px 10px;
  color: var(--muted-foreground);
  font-size: 0.75em;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ub-side-nav-item {
  padding: 7px 10px;
  color: var(--foreground);
  font-size: 0.875em;
  line-height: 1.4;
  text-decoration: none;
  border-radius: var(--radius-md);
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.ub-side-nav-item:hover {
  background: var(--muted);
}

.ub-side-nav-item:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-side-nav-item:where([data-active]) {
  background: var(--muted);
  color: var(--foreground);
  font-weight: 500;
}

/* --- Header ------------------------------------------------------------------
   A flex row with the action pushed to the far end by margin-left: auto rather
   than space-between: with two groups space-between works and with three it
   centres the links, so a header would re-lay itself out the moment someone
   added or cleared a call to action. An auto margin says "everything before me
   goes left" once, whatever is there.

   The bar paints no background of its own beyond the hairline. A header is
   chrome around the design, and a filled one would be deciding the page's
   colour before the user has. */

.ub-header {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  color: var(--foreground);
}

.ub-header:where([data-bordered]) {
  border-bottom: 1px solid var(--border);
}

/* top and z-index together: a sticky element with no inset never sticks, and one
   with no stacking order is painted over by the section that scrolls under it. */
.ub-header:where([data-sticky]) {
  position: sticky;
  top: 0;
  z-index: 10;
}

.ub-header-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: inherit;
  text-decoration: none;
}

/* A height and an auto width, so a logo of any aspect ratio lines up with the
   wordmark instead of setting the height of the whole bar. */
.ub-header-logo {
  display: block;
  height: 24px;
  width: auto;
  object-fit: contain;
}

.ub-header-name {
  font-size: 0.9375em;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.ub-header-nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.ub-header-item {
  padding: 6px 10px;
  color: var(--muted-foreground);
  font-size: 0.875em;
  line-height: 1.4;
  white-space: nowrap;
  text-decoration: none;
  border-radius: var(--radius-md);
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.ub-header-item:hover {
  background: var(--muted);
  color: var(--foreground);
}

.ub-header-item:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-header-item:where([data-active]) {
  color: var(--foreground);
  font-weight: 500;
}

/* The action wears .ub-button as well, so this only says the two things an anchor
   needs that a button does not. It has to stay after the Button section for that
   to work: every selector here weighs one class, so source order decides. */
.ub-header-cta {
  margin-left: auto;
  text-decoration: none;
}

/* --- Footer ------------------------------------------------------------------
   The header's counterpart, and the same reasoning: a hairline, no fill. The top
   row wraps, because a brand block with a tagline and a row of five links is the
   one part of a page that runs out of width first on a tablet frame. */

.ub-footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  color: var(--muted-foreground);
  font-size: 14px;
}

.ub-footer:where([data-bordered]) {
  border-top: 1px solid var(--border);
}

.ub-footer-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-8);
}

.ub-footer-brand {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ub-footer-mark {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.ub-footer-logo {
  display: block;
  height: 22px;
  width: auto;
  object-fit: contain;
}

.ub-footer-name {
  color: var(--foreground);
  font-size: 1.0714em;
  font-weight: 600;
  letter-spacing: -0.01em;
}

/* A measure rather than a width: a tagline is a sentence, and 42 characters is
   where one stops being comfortable to read. */
.ub-footer-tagline {
  max-width: 42ch;
  margin: 0;
  line-height: 1.6;
}

.ub-footer-nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
}

.ub-footer-item {
  color: inherit;
  text-decoration: none;
  transition: color 150ms ease;
}

.ub-footer-item:hover {
  color: var(--foreground);
}

.ub-footer-item:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.ub-footer-copyright {
  font-size: 0.9286em;
}

/* --- Image ------------------------------------------------------------------ */

.ub-image {
  display: block;
  max-width: 100%;
}

.ub-image:where([data-fit='cover']) { object-fit: cover; }
.ub-image:where([data-fit='contain']) { object-fit: contain; }
.ub-image:where([data-fit='fill']) { object-fit: fill; }

/* --- Chat thread -------------------------------------------------------------
   align-items: stretch, not start — a user message right-aligns itself from inside
   its own row, so the row has to span the column for it to have anywhere to go. */

.ub-chat-thread {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-4);
}

.ub-chat-thread:where([data-bordered='true']) {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

/* --- Chat message ------------------------------------------------------------
   One role attribute moves the row, the avatar and the bubble together. The inner
   elements never carry a node class, so a descendant selector here cannot collide
   with the rules the inspector writes — only the root .ub-chat-message can, and
   that one stays at a single class of weight like the rest of the sheet.

   row-reverse rather than a separate order, so the gap between avatar and bubble
   stays on the correct side without a second declaration. */

.ub-chat-message {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.ub-chat-message:where([data-role='assistant']) {
  flex-direction: row;
}

.ub-chat-message:where([data-role='user']) {
  flex-direction: row-reverse;
}

.ub-chat-message:where([data-role='system']) {
  justify-content: center;
}

.ub-chat-message-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 0.75em;
  font-weight: 600;
  line-height: 1;
  user-select: none;
}

.ub-chat-message:where([data-role='user']) .ub-chat-message-avatar {
  background: var(--primary);
  color: var(--primary-foreground);
}

/* min-width: 0 so a long unbroken token wraps instead of widening the whole row —
   the same reason the grid uses minmax(0, 1fr). */
.ub-chat-message-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.ub-chat-message:where([data-role='user']) .ub-chat-message-body {
  align-items: flex-end;
}

.ub-chat-message-author {
  color: var(--muted-foreground);
  font-size: 0.75em;
  font-weight: 500;
  line-height: 1.4;
}

.ub-chat-message-bubble {
  padding: 10px 14px;
  background: var(--muted);
  color: var(--foreground);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  font-size: 0.875em;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ub-chat-message:where([data-role='assistant']) .ub-chat-message-bubble {
  background: var(--card);
  color: var(--card-foreground);
  border-color: var(--border);
}

.ub-chat-message:where([data-role='user']) .ub-chat-message-bubble {
  background: var(--primary);
  color: var(--primary-foreground);
}

.ub-chat-message:where([data-role='system']) .ub-chat-message-bubble {
  padding: 4px 12px;
  background: transparent;
  color: var(--muted-foreground);
  border-radius: var(--radius-full);
  font-size: 0.75em;
  text-align: center;
}

/* --- Prompt input ------------------------------------------------------------
   The wrapper is the control: it owns the border, the radius and the focus ring,
   and the textarea inside it is borderless. That is the whole reason this is one
   component rather than a Textarea sitting next to a Button. */

.ub-prompt-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 8px;
  background: var(--card);
  border: 1px solid var(--input);
  border-radius: var(--radius-lg);
  transition: border-color 150ms ease;
}

.ub-prompt-input:focus-within {
  border-color: var(--ring);
}

.ub-prompt-input:where([data-disabled]) {
  opacity: 0.5;
}

.ub-prompt-input-field {
  display: block;
  width: 100%;
  padding: 4px 6px;
  background: transparent;
  border: 0;
  color: var(--foreground);
  font-family: inherit;
  font-size: 0.875em;
  line-height: 1.6;
  resize: none;
}

.ub-prompt-input-field::placeholder {
  color: var(--muted-foreground);
}

/* The wrapper already draws the focus state, and two rings on one control reads as
   a rendering bug. */
.ub-prompt-input-field:focus-visible {
  outline: none;
}

.ub-prompt-input-field:disabled {
  cursor: not-allowed;
}

.ub-prompt-input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.ub-prompt-input-hint {
  color: var(--muted-foreground);
  font-size: 0.75em;
  line-height: 1.4;
}

.ub-prompt-input-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 0.8125em;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.ub-prompt-input-send:hover {
  background: color-mix(in srgb, var(--primary) 90%, transparent);
}

.ub-prompt-input-send:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-prompt-input-send:disabled {
  cursor: not-allowed;
}

/* --- Typing indicator --------------------------------------------------------
   currentColor on the dots, so recolouring the node in the inspector recolours the
   animation with it rather than leaving three grey dots on a restyled bubble. */

.ub-typing-indicator {
  display: inline-flex;
  align-items: center;
  /* A definite cross size, so the stretch a ChatThread applies to its children does
     not blow the pill out to the width of the conversation. inline-flex alone does
     not survive that: a flex item's auto cross size is what align-items acts on, and
     fit-content is the same width the inline box would have taken anyway. */
  width: fit-content;
  gap: var(--space-2);
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.4;
}

.ub-typing-indicator:where([data-bubble='true']) {
  background: var(--card);
  border-color: var(--border);
}

.ub-typing-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ub-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: currentColor;
  animation: ub-typing-bounce 1.2s ease-in-out infinite;
}

.ub-typing-dot:where(:nth-child(2)) { animation-delay: 0.15s; }
.ub-typing-dot:where(:nth-child(3)) { animation-delay: 0.3s; }

.ub-typing-label {
  color: inherit;
}

@keyframes ub-typing-bounce {
  0%, 60%, 100% { opacity: 0.35; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

/* A looping animation with no way to stop it is exactly what this query is for, and
   the dots still have to read as three dots once it is off. */
@media (prefers-reduced-motion: reduce) {
  .ub-typing-dot {
    animation: none;
    opacity: 0.55;
  }
}

/* --- Status colours -----------------------------------------------------------
   The two colours the shadcn token set does not carry. Everything else in this
   sheet is a theme token, so these are declared once and named rather than written
   into four component rules — a project that wants its own success green overrides
   one custom property instead of hunting for every place a literal was typed. */

:root {
  --ub-success: hsl(142 71% 36%);
  --ub-warning: hsl(38 92% 42%);
}

/* --- Code block --------------------------------------------------------------
   The frame, not the highlighting: a tokenizer and a theme are what an exported
   project would then be shipping, and a design tool can be honest about the frame.
   The <pre> scrolls rather than the block growing, so a long line cannot push the
   column it sits in wider than the page. */

.ub-code-block {
  display: flex;
  flex-direction: column;
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.ub-code-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 8px 12px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  color: var(--muted-foreground);
  font-size: 0.75em;
  line-height: 1.4;
}

.ub-code-block-name {
  color: var(--foreground);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ub-code-block-language {
  flex: none;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ub-code-block-pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
}

.ub-code-block-code {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 0.8125em;
  line-height: 1.6;
  white-space: pre;
}

.ub-code-block:where([data-wrap]) .ub-code-block-code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* --- Tool call ---------------------------------------------------------------
   One status property moves the dot, the word and the border together, set on the
   details and read by the parts — the same inheritance trick .ub-table uses, and
   for the same reason: a descendant selector qualified by the status would weigh
   two classes and out-specify the rule the inspector writes. */

.ub-tool-call {
  --ub-tool-status: var(--muted-foreground);

  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.ub-tool-call:where([data-status='running']) { --ub-tool-status: var(--ub-warning); }
.ub-tool-call:where([data-status='success']) { --ub-tool-status: var(--ub-success); }
.ub-tool-call:where([data-status='error']) { --ub-tool-status: var(--destructive); }

.ub-tool-call-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 8px 12px;
  font-family: var(--font-mono);
  font-size: 0.8125em;
  line-height: 1.4;
  cursor: pointer;
  list-style: none;
}

/* Safari draws its own triangle from a pseudo-element no other engine has. */
.ub-tool-call-summary::-webkit-details-marker {
  display: none;
}

.ub-tool-call-summary:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

.ub-tool-call-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--ub-tool-status);
}

.ub-tool-call-name {
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ub-tool-call-state {
  margin-left: auto;
  color: var(--ub-tool-status);
  font-size: 0.9231em;
}

.ub-tool-call-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 12px 12px;
}

.ub-tool-call-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ub-tool-call-label {
  color: var(--muted-foreground);
  font-size: 0.6875em;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ub-tool-call-code {
  margin: 0;
  padding: 8px 10px;
  background: var(--muted);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 0.75em;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* --- Citation ----------------------------------------------------------------
   Inline and baseline-aligned, because a citation belongs in a sentence rather
   than beside one. SourceCard is the same fact given a block of its own. */

.ub-citation {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 8px 1px 3px;
  background: var(--muted);
  color: var(--muted-foreground);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  font-size: 12px;
  line-height: 1.5;
  text-decoration: none;
  vertical-align: baseline;
  transition:
    color 150ms ease,
    border-color 150ms ease;
}

.ub-citation:hover {
  color: var(--foreground);
  border-color: var(--border);
}

.ub-citation:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-citation-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 16px;
  height: 16px;
  background: var(--background);
  border-radius: var(--radius-full);
  font-size: 0.8333em;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ub-citation-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* --- Source card -------------------------------------------------------------
   The whole card is the link, so the target is its area rather than four words
   inside it — which is what someone on a phone is aiming at. */

.ub-source-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-decoration: none;
  transition: border-color 150ms ease;
}

.ub-source-card:hover {
  border-color: var(--ring);
}

.ub-source-card:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-source-card-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted-foreground);
  font-size: 0.75em;
  line-height: 1.4;
}

.ub-source-card-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 18px;
  height: 18px;
  background: var(--muted);
  border-radius: var(--radius-full);
  font-size: 0.9167em;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ub-source-card-source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ub-source-card-title {
  font-size: 0.875em;
  font-weight: 600;
  line-height: 1.4;
}

.ub-source-card-snippet {
  color: var(--muted-foreground);
  font-size: 0.8125em;
  line-height: 1.6;
}

/* --- Alert -------------------------------------------------------------------
   The icon is an empty span the sheet fills, so one piece of markup covers four
   states and an export still ships no icon set. The accent is a custom property
   for .ub-table's reason: it inherits down to the parts, and inheritance has no
   specificity to lose against the rule the inspector writes. */

.ub-alert {
  --ub-alert-accent: var(--muted-foreground);
  --ub-alert-glyph: 'i';

  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: 12px 14px;
  background: color-mix(in srgb, var(--ub-alert-accent) 8%, var(--background));
  color: var(--foreground);
  border: 1px solid color-mix(in srgb, var(--ub-alert-accent) 28%, transparent);
  border-radius: var(--radius-md);
}

.ub-alert:where([data-variant='info']) {
  --ub-alert-accent: var(--muted-foreground);
  --ub-alert-glyph: 'i';
}

.ub-alert:where([data-variant='success']) {
  --ub-alert-accent: var(--ub-success);
  --ub-alert-glyph: '\\2713';
}

.ub-alert:where([data-variant='warning']) {
  --ub-alert-accent: var(--ub-warning);
  --ub-alert-glyph: '!';
}

.ub-alert:where([data-variant='danger']) {
  --ub-alert-accent: var(--destructive);
  --ub-alert-glyph: '\\00d7';
}

.ub-alert-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  background: var(--ub-alert-accent);
  border-radius: var(--radius-full);
  color: var(--background);
  font-size: 0.6875em;
  font-weight: 700;
  line-height: 1;
}

.ub-alert-icon::before {
  content: var(--ub-alert-glyph);
}

.ub-alert-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ub-alert-title {
  font-size: 0.875em;
  font-weight: 600;
  line-height: 1.4;
}

.ub-alert-text {
  color: var(--muted-foreground);
  font-size: 0.875em;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* --- Progress ----------------------------------------------------------------
   A native <progress>, so a screen reader is told what it is without an aria prop
   being typed. Styling it is pseudo-elements, one set per engine — appearance:
   none is what stops the platform bar being drawn under them. */

.ub-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ub-progress-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: 0.75em;
  line-height: 1.4;
}

.ub-progress-label {
  color: var(--foreground);
  font-weight: 500;
}

.ub-progress-value {
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
}

.ub-progress-bar {
  appearance: none;
  display: block;
  width: 100%;
  height: 8px;
  background: var(--muted);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--primary);
  overflow: hidden;
}

.ub-progress-bar::-webkit-progress-bar {
  background: var(--muted);
  border-radius: var(--radius-full);
}

.ub-progress-bar::-webkit-progress-value {
  background: var(--primary);
  border-radius: var(--radius-full);
}

.ub-progress-bar::-moz-progress-bar {
  background: var(--primary);
  border-radius: var(--radius-full);
}

/* --- Breadcrumb --------------------------------------------------------------
   The separator is a pseudo-element on every crumb but the first, so there is no
   chevron anyone can select, restyle or delete out of one breadcrumb on one page.
   :where() around the :not() keeps it at a single class of weight. */

.ub-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: 13px;
  line-height: 1.4;
}

.ub-breadcrumb-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted-foreground);
  text-decoration: none;
  transition: color 150ms ease;
}

.ub-breadcrumb-item:where(:not(:first-child))::before {
  content: '';
  flex: none;
  width: 5px;
  height: 5px;
  border-top: 1.5px solid var(--border);
  border-right: 1.5px solid var(--border);
  transform: rotate(45deg);
}

.ub-breadcrumb-item:hover {
  color: var(--foreground);
}

.ub-breadcrumb-item:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-breadcrumb-item:where([data-active]) {
  color: var(--foreground);
  font-weight: 500;
}

/* --- Scroll area -------------------------------------------------------------
   The scrollbar is the browser's. Styling one is a per-platform decision a design
   tool should not make for its author, and a rule here would be one an exported
   project could not undo without knowing this file exists. */

.ub-scroll {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow: hidden;
}

.ub-scroll:where([data-axis='vertical']) {
  overflow-x: hidden;
  overflow-y: auto;
}

.ub-scroll:where([data-axis='horizontal']) {
  flex-direction: row;
  overflow-x: auto;
  overflow-y: hidden;
}

.ub-scroll:where([data-axis='both']) {
  overflow: auto;
}

/* --- Modal -------------------------------------------------------------------
   A stage in normal flow — a dimmed area with a panel centred in it — rather than
   a fixed overlay. Fixed, it would cover the page being designed and sit outside
   every rect the canvas hit-tests against, so it would be a component nobody could
   select; pinning it is a position and an inset in the Design tab, and both land on
   this root element. The stage is a flex *column* so that the axis the editor reads
   off it is the axis its body actually stacks along. */

.ub-modal {
  --ub-modal-width: 480px;

  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  border-radius: var(--radius-lg);
}

.ub-modal:where([data-size='sm']) { --ub-modal-width: 360px; }
.ub-modal:where([data-size='md']) { --ub-modal-width: 480px; }
.ub-modal:where([data-size='lg']) { --ub-modal-width: 640px; }

.ub-modal-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--foreground) 45%, transparent);
  border-radius: inherit;
}

.ub-modal-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  max-width: var(--ub-modal-width);
  padding: var(--space-6);
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--foreground) 6%, transparent),
    0 12px 32px color-mix(in srgb, var(--foreground) 14%, transparent);
}

.ub-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.ub-modal-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ub-modal-title {
  margin: 0;
  font-size: 1.125em;
  font-weight: 600;
  line-height: 1.3;
}

.ub-modal-description {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.875em;
  line-height: 1.6;
  white-space: pre-wrap;
}

.ub-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* --- Drawer ------------------------------------------------------------------
   Modal with the panel pushed into a corner. One side attribute decides which
   corner, which measurement size means and which edge is rounded — the four
   declarations someone would otherwise revisit every time they changed their mind
   about the edge it comes from. */

.ub-drawer {
  --ub-drawer-size: 360px;

  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.ub-drawer:where([data-size='sm']) { --ub-drawer-size: 280px; }
.ub-drawer:where([data-size='md']) { --ub-drawer-size: 360px; }
.ub-drawer:where([data-size='lg']) { --ub-drawer-size: 480px; }

.ub-drawer:where([data-side='right']) { align-items: flex-end; }
.ub-drawer:where([data-side='left']) { align-items: flex-start; }
.ub-drawer:where([data-side='top']) { justify-content: flex-start; }
.ub-drawer:where([data-side='bottom']) { justify-content: flex-end; }

.ub-drawer-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--foreground) 45%, transparent);
}

.ub-drawer-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  box-shadow: 0 0 32px color-mix(in srgb, var(--foreground) 14%, transparent);
}

/* A side drawer is full height and as wide as its size; a top or bottom one is the
   other way round. flex: 1 rather than height: 100% so the panel fills the stage
   whatever padding the design puts on it. */
.ub-drawer:where([data-side='right']) .ub-drawer-panel,
.ub-drawer:where([data-side='left']) .ub-drawer-panel {
  flex: 1;
  width: var(--ub-drawer-size);
  max-width: 100%;
}

.ub-drawer:where([data-side='top']) .ub-drawer-panel,
.ub-drawer:where([data-side='bottom']) .ub-drawer-panel {
  width: 100%;
  height: var(--ub-drawer-size);
  max-height: 100%;
}

.ub-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.ub-drawer-title {
  margin: 0;
  font-size: 1em;
  font-weight: 600;
  line-height: 1.3;
}

.ub-drawer-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
  overflow: auto;
}

/* One shape for both close controls: the same button, and stating it once is what
   keeps it the same after the next edit to either component. */
.ub-modal-close,
.ub-drawer-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  margin: -2px -2px 0 0;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--muted-foreground);
  font-family: inherit;
  font-size: 1.125em;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.ub-modal-close:hover,
.ub-drawer-close:hover {
  background: var(--muted);
  color: var(--foreground);
}

.ub-modal-close:focus-visible,
.ub-drawer-close:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* --- Tooltip -----------------------------------------------------------------
   Shown by CSS rather than by state: :hover for the pointer, :focus-within for the
   keyboard, and no JavaScript in the export. pointer-events: none on the bubble so
   it cannot swallow the click meant for what it describes. */

.ub-tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.ub-tooltip-trigger {
  display: inline-flex;
  align-items: center;
}

.ub-tooltip-bubble {
  position: absolute;
  z-index: 1;
  width: max-content;
  max-width: 220px;
  padding: 5px 9px;
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 0.75em;
  line-height: 1.4;
  white-space: pre-wrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--foreground) 10%, transparent);
}

.ub-tooltip:where([data-side='top']) .ub-tooltip-bubble {
  bottom: 100%;
  left: 50%;
  transform: translate(-50%, -6px);
}

.ub-tooltip:where([data-side='bottom']) .ub-tooltip-bubble {
  top: 100%;
  left: 50%;
  transform: translate(-50%, 6px);
}

.ub-tooltip:where([data-side='left']) .ub-tooltip-bubble {
  right: 100%;
  top: 50%;
  transform: translate(-6px, -50%);
}

.ub-tooltip:where([data-side='right']) .ub-tooltip-bubble {
  left: 100%;
  top: 50%;
  transform: translate(6px, -50%);
}

.ub-tooltip:hover .ub-tooltip-bubble,
.ub-tooltip:focus-within .ub-tooltip-bubble,
.ub-tooltip:where([data-visible]) .ub-tooltip-bubble {
  opacity: 1;
}

/* --- Tabs --------------------------------------------------------------------
   Two variants of the same strip: a rule under the row, or a filled pill in a
   tray. The current tab is data-active, present or absent, which is the same
   spelling navItems uses for the current link. */

.ub-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ub-tabs-list {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.ub-tab {
  appearance: none;
  background: none;
  border: 0;
  color: var(--muted-foreground);
  font-family: inherit;
  font-size: 0.875em;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  transition:
    color 150ms ease,
    background-color 150ms ease;
}

.ub-tab:hover {
  color: var(--foreground);
}

.ub-tab:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.ub-tabs:where([data-variant='line']) .ub-tabs-list {
  border-bottom: 1px solid var(--border);
}

/* The negative margin is what puts the tab's own underline on top of the list's
   rule rather than a pixel below it. */
.ub-tabs:where([data-variant='line']) .ub-tab {
  margin-bottom: -1px;
  padding: 8px 2px;
  border-bottom: 2px solid transparent;
}

.ub-tabs:where([data-variant='line']) .ub-tab:where([data-active]) {
  color: var(--foreground);
  border-bottom-color: var(--primary);
}

.ub-tabs:where([data-variant='pill']) .ub-tabs-list {
  gap: 2px;
  padding: 3px;
  background: var(--muted);
  border-radius: var(--radius-md);
}

.ub-tabs:where([data-variant='pill']) .ub-tab {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
}

.ub-tabs:where([data-variant='pill']) .ub-tab:where([data-active]) {
  background: var(--background);
  color: var(--foreground);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--foreground) 8%, transparent);
}

.ub-tabs-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* --- Accordion ---------------------------------------------------------------
   Native <details> rows, which is what makes this one node and what lets the
   export open and close with nothing wired up. The chevron is a pseudo-element
   drawn from two borders, so no icon set is shipped for it. */

.ub-accordion {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.ub-accordion-item {
  border-bottom: 1px solid var(--border);
}

.ub-accordion-item:where(:last-child) {
  border-bottom: 0;
}

.ub-accordion-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 12px 14px;
  color: var(--foreground);
  font-size: 0.875em;
  font-weight: 500;
  line-height: 1.5;
  cursor: pointer;
  list-style: none;
}

.ub-accordion-summary::-webkit-details-marker {
  display: none;
}

.ub-accordion-summary:hover {
  background: var(--muted);
}

.ub-accordion-summary:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

.ub-accordion-summary::after {
  content: '';
  flex: none;
  width: 7px;
  height: 7px;
  margin-right: 3px;
  border-right: 1.5px solid var(--muted-foreground);
  border-bottom: 1.5px solid var(--muted-foreground);
  transform: translateY(-2px) rotate(45deg);
  transition: transform 150ms ease;
}

.ub-accordion-item:where([open]) .ub-accordion-summary::after {
  transform: translateY(2px) rotate(-135deg);
}

.ub-accordion-body {
  padding: 0 14px 14px;
  color: var(--muted-foreground);
  font-size: 0.875em;
  line-height: 1.6;
  white-space: pre-wrap;
}
`.trim();

/**
 * Shown in place of a container that has no children yet.
 *
 * A zero-height empty stack is invisible and, worse, untargetable — there is nothing
 * for a drop to hit-test against. This gives every empty container a minimum area and
 * says what to do with it (PLAN.md §6). It is editor chrome, so it is injected only
 * by the canvas and never appears in the preview or the export.
 */
export const EMPTY_CONTAINER_CSS = `
[data-ub-empty] {
  min-height: 56px;
  min-width: 56px;
  border: 1px dashed var(--ub-editor-hairline, hsl(215 16% 47% / 0.4));
  border-radius: 4px;
}

/*
 * A slot, while the component that owns it is being authored.
 *
 * This is the one element in the library that exists on the canvas and in no export — a
 * slot emits its caller's children and renders no box anywhere else (see SlotSpec), so
 * the rule is here in the editor's sheet rather than in COMPONENT_CSS. Putting it there
 * would ship it to a stranger's project as dead weight and imply an element that is not
 * there. No backticks in here: this comment lives inside a template literal, and one
 * would terminate it — the failure PLAN.md's Phases 3-6 notes record.
 *
 * The accent-tinted dashes say "something goes here" rather than "this is empty", which is
 * the neighbouring rule's job and a different fact. The min-height keeps it droppable when
 * the author has not put a fallback in it yet.
 */
.ub-slot {
  min-height: 40px;
  padding: 4px;
  border: 1px dashed var(--ub-editor-accent, hsl(217 91% 60% / 0.5));
  border-radius: 4px;
  background: var(--ub-editor-accent-wash, hsl(217 91% 60% / 0.04));
}

[data-ub-empty]::after {
  content: attr(data-ub-empty);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 54px;
  padding: 4px 8px;
  color: var(--muted-foreground, hsl(215 16% 47%));
  font-family: var(--font-sans);
  font-size: 12px;
  text-align: center;
  pointer-events: none;
}
`.trim();
