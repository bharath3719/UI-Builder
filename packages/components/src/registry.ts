/**
 * The registry — the one list every subsystem reads (D7).
 *
 * Registering a component is adding its file to `SPECS`. Nothing else in the studio
 * keeps a parallel list of what exists.
 *
 * Data, like everything this entry point reaches: the specs are here, the React
 * components they name are in `react/implementations.ts`, and `SPECS` is what says which
 * keys exist. See `spec.ts`.
 */

import {
  DEFAULT_THEME,
  DOC_SCHEMA_VERSION,
  createNodeId,
  makeNode,
  makePage,
  staticProp,
  symbolIdOf,
  type Node,
  type Page,
  type ProjectDoc,
  type StyleDecls,
  type SymbolDef,
} from '@ui-builder/schema';
import { CATEGORY_ORDER, type ComponentCategory, type ComponentSpec } from './spec.js';
import { specForSymbolType, symbolSpec } from './symbols.js';
import { AvatarSpec } from './specs/Avatar.js';
import { BadgeSpec } from './specs/Badge.js';
import { BoxSpec } from './specs/Box.js';
import { ButtonSpec } from './specs/Button.js';
import { CardSpec } from './specs/Card.js';
import { ChatMessageSpec } from './specs/ChatMessage.js';
import { ChatThreadSpec } from './specs/ChatThread.js';
import { CheckboxSpec } from './specs/Checkbox.js';
import { DatePickerSpec } from './specs/DatePicker.js';
import { DividerSpec } from './specs/Divider.js';
import { FooterSpec } from './specs/Footer.js';
import { GridSpec } from './specs/Grid.js';
import { HeaderSpec } from './specs/Header.js';
import { HeadingSpec } from './specs/Heading.js';
import { ImageSpec } from './specs/Image.js';
import { InputSpec } from './specs/Input.js';
import { LinkSpec } from './specs/Link.js';
import { PromptInputSpec } from './specs/PromptInput.js';
import { RadioSpec } from './specs/Radio.js';
import { RichTextSpec } from './specs/RichText.js';
import { SelectSpec } from './specs/Select.js';
import { SideNavSpec } from './specs/SideNav.js';
import { SliderSpec } from './specs/Slider.js';
import { SpacerSpec } from './specs/Spacer.js';
import { HStackSpec, VStackSpec } from './specs/Stack.js';
import { SwitchSpec } from './specs/Switch.js';
import { TableSpec } from './specs/Table.js';
import { TextSpec } from './specs/Text.js';
import { TextareaSpec } from './specs/Textarea.js';
import { TypingIndicatorSpec } from './specs/TypingIndicator.js';

/**
 * Order within a category is the palette's order, and it is editorial: the thing
 * someone reaches for most comes first, not the thing that was written first.
 */
export const SPECS: readonly ComponentSpec[] = [
  BoxSpec,
  VStackSpec,
  HStackSpec,
  GridSpec,
  SpacerSpec,
  DividerSpec,
  // The page chrome, in the order someone reaches for it: nearly every page has a
  // header, most have a footer, and a side nav is an app-shell decision.
  HeaderSpec,
  FooterSpec,
  SideNavSpec,

  HeadingSpec,
  TextSpec,
  RichTextSpec,
  ButtonSpec,
  LinkSpec,
  BadgeSpec,
  AvatarSpec,

  InputSpec,
  TextareaSpec,
  SelectSpec,
  RadioSpec,
  CheckboxSpec,
  SwitchSpec,
  SliderSpec,
  DatePickerSpec,

  // Card first: it is the container someone reaches for before they have data to put in
  // a table, and the palette reads in the order a page gets built.
  CardSpec,
  TableSpec,

  ImageSpec,

  // Thread first: it is the container the other three are dropped into, so the palette
  // reads in the order someone builds a chat surface.
  ChatThreadSpec,
  ChatMessageSpec,
  PromptInputSpec,
  TypingIndicatorSpec,
];

const BY_KEY = new Map(SPECS.map((spec) => [spec.key, spec]));

/** The library only. `symbol:` keys miss by construction — see {@link specFor}. */
export function getSpec(key: string): ComponentSpec | undefined {
  return BY_KEY.get(key);
}

/**
 * The spec for any node type — a library component, or one of this document's symbols.
 *
 * The single call every subsystem holding a `Node` makes, so "is this a symbol?" is asked
 * in one place rather than at each of them. A symbol the document no longer has returns
 * undefined exactly as a component the library no longer has does, which is what makes
 * the renderer's unknown-component box cover both without a second branch.
 */
export function specFor(
  type: string,
  symbols: readonly SymbolDef[] = [],
): ComponentSpec | undefined {
  return symbolIdOf(type) === null ? getSpec(type) : specForSymbolType(type, symbols);
}

/**
 * Everything that can be dropped onto a canvas: the document's own components first, then
 * the library. The order is the palette's, and `symbolSpec` gives each symbol the
 * `Symbols` category that puts it there.
 */
export function allSpecs(symbols: readonly SymbolDef[] = []): ComponentSpec[] {
  return [...symbols.map(symbolSpec), ...SPECS];
}

/** Grouped for the palette, in the fixed category order rather than by registration. */
export function specsByCategory(
  symbols: readonly SymbolDef[] = [],
): { category: ComponentCategory; specs: ComponentSpec[] }[] {
  const specs = allSpecs(symbols);
  return CATEGORY_ORDER.map((category) => ({
    category,
    specs: specs.filter((spec) => spec.category === category),
  })).filter((group) => group.specs.length > 0);
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Ranked substring matching over display name, key and keywords.
 *
 * Hand-rolled rather than Fuse.js: with a library this size the whole index fits in
 * one pass, and the ranking a builder actually needs is positional — "col" must
 * surface "Vertical Stack" via its `column` keyword, and a name that *starts* with
 * the query must beat one that merely contains it. Fuse's fuzzy matching earns its
 * weight once the library reaches the full §7 table; the signature here does not
 * change when it does.
 */
export function searchSpecs(query: string, symbols: readonly SymbolDef[] = []): ComponentSpec[] {
  const needle = query.trim().toLowerCase();
  const candidates = allSpecs(symbols);
  if (needle === '') return candidates;

  const scored: { spec: ComponentSpec; score: number }[] = [];

  for (const spec of candidates) {
    const name = spec.displayName.toLowerCase();
    const key = spec.key.toLowerCase();

    let score = 0;
    if (name === needle || key === needle) score = 100;
    else if (name.startsWith(needle) || key.startsWith(needle)) score = 80;
    else if (name.includes(needle)) score = 60;
    else {
      // Keywords are the words someone types when they do not know our name for the
      // thing, so a keyword prefix outranks a name substring elsewhere in the string.
      const keyword = spec.keywords.find((word) => word.startsWith(needle));
      if (keyword) score = 70;
      else if (spec.keywords.some((word) => word.includes(needle))) score = 40;
      else if (spec.category.toLowerCase().startsWith(needle)) score = 20;
    }

    if (score > 0) scored.push({ spec, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.spec.displayName.localeCompare(b.spec.displayName))
    .map((entry) => entry.spec);
}

/* -------------------------------------------------------------------------- */
/* Node construction                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A fresh node for a component, with the spec's defaults baked in.
 *
 * Defaults are copied into the node rather than read from the spec at render time so
 * that a document keeps rendering the way it was designed after the library changes
 * its own defaults — the node records a decision, not a reference to one.
 */
export function createNodeFor(
  spec: ComponentSpec,
  init: { id?: string; name?: string } = {},
): Node {
  return makeNode({
    id: init.id ?? createNodeId(),
    type: spec.key,
    name: init.name ?? spec.displayName,
    props: Object.fromEntries(
      Object.entries(spec.defaultProps).map(([name, value]) => [name, staticProp(value)]),
    ),
    styles:
      Object.keys(spec.defaultStyles).length > 0
        ? { base: { default: { ...spec.defaultStyles } as StyleDecls } }
        : {},
  });
}

/**
 * Whether a node of this type can take children dropped into it.
 *
 * A symbol instance never can: what is inside it belongs to the symbol, and a drop that
 * landed there would be a child of nothing. `symbolSpec` says so, and the symbols have to
 * be passed for that answer to be reached at all — the default is the same `false` an
 * unknown type gets, which is the safe way to be wrong.
 */
export function acceptsChildren(type: string, symbols: readonly SymbolDef[] = []): boolean {
  return specFor(type, symbols)?.acceptsChildren ?? false;
}

/**
 * A blank page: one full-height root that accepts children and nothing inside it. An
 * empty canvas with a drop target beats a canvas pre-filled with content the user has
 * to delete first.
 *
 * Built here rather than in `schema` for the same reason `createProjectDoc` is — a page
 * is made of real components, and `schema` is not allowed to know that any exist. So
 * `addPage` takes a page rather than making one, exactly as `insertNode` takes a node.
 */
export function createPage(init: { name?: string; path?: string } = {}): Page {
  const root = makeNode({
    id: createNodeId(),
    type: 'Box',
    name: 'Page',
    styles: {
      base: {
        default: {
          minHeight: '100%',
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        },
      },
    },
  });

  return makePage({
    id: createNodeId(),
    name: init.name ?? 'Home',
    path: init.path ?? '/',
    rootId: root.id,
    nodes: { [root.id]: root },
  });
}

/**
 * A new project's document: one starter page on the default theme.
 *
 * Built here rather than in `schema` because it needs the registry — a starter page is
 * made of real components, and `schema` is not allowed to know that any exist. It is
 * what the studio seeds with when the API answers that a project has never been saved,
 * which is the only place a document is created from nothing.
 */
export function createProjectDoc(init: { id: string; name: string }): ProjectDoc {
  return {
    schemaVersion: DOC_SCHEMA_VERSION,
    id: init.id,
    name: init.name,
    pages: [createPage()],
    symbols: [],
    theme: DEFAULT_THEME,
  };
}
