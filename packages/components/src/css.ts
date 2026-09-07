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

export const COMPONENT_CSS = `
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

.ub-rich-text :where(h1) { font-size: 36px; }
.ub-rich-text :where(h2) { font-size: 28px; }
.ub-rich-text :where(h3) { font-size: 22px; }
.ub-rich-text :where(h4) { font-size: 18px; }
.ub-rich-text :where(h5) { font-size: 16px; }
.ub-rich-text :where(h6) { font-size: 14px; }

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
  font-size: 14px;
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
  font-size: 13px;
  text-align: left;
  caption-side: top;
}

.ub-table-head {
  color: var(--muted-foreground);
}

.ub-table-header {
  padding: var(--ub-table-cell-y) var(--ub-table-cell-x);
  color: inherit;
  font-size: 12px;
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
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ub-side-nav-item {
  padding: 7px 10px;
  color: var(--foreground);
  font-size: 14px;
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
  font-size: 15px;
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
  font-size: 14px;
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
  font-size: 15px;
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
  font-size: 13px;
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
  font-size: 12px;
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
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.ub-chat-message-bubble {
  padding: 10px 14px;
  background: var(--muted);
  color: var(--foreground);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  font-size: 14px;
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
  font-size: 12px;
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
  font-size: 14px;
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
  font-size: 12px;
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
  font-size: 13px;
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
