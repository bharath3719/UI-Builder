# UI Builder — Implementation Plan

A Plasmic-style visual UI builder: workspaces & projects, drag-and-drop canvas,
layout primitives, searchable component palette, zoomable canvas, properties panel,
live preview, React code export, and control interactions (onClick, state, data).

**Stack:** React + TypeScript (Vite) · Node (Fastify) · PostgreSQL (Prisma)

---

## 1. Decisions made up front

These are the load-bearing choices. Each one has a short rationale so we can revisit
deliberately rather than by accident.

| #   | Decision                                                                                                                                      | Why                                                                                                                                                                                                                                                                                                                                                                                        | Cost to change later                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| D1  | **npm workspaces monorepo**                                                                                                                   | Shared `schema`/`codegen` packages must be imported by both web and api. npm 11 is already installed — no extra toolchain to introduce.                                                                                                                                                                                                                                                    | Low (Phase 0)                             |
| D2  | **Canvas renders inside an `<iframe>`**                                                                                                       | Total CSS isolation between studio chrome and the user's design. Accurate layout measurement. Same approach Plasmic/Webflow/Framer use.                                                                                                                                                                                                                                                    | **Very high** — retrofitting is a rewrite |
| D3  | **Normalized flat node map** (`Record<NodeId, Node>` + `children: NodeId[]`) rather than a nested tree                                        | O(1) lookup for selection/hover/edit, tiny undo patches, trivial reparenting, and it is the shape collaborative editing needs.                                                                                                                                                                                                                                                             | High                                      |
| D4  | **Project document stored as JSONB** in Postgres, not as relational node rows                                                                 | The doc shape will change weekly during development; it is always loaded whole; snapshots must be atomic. Normalizing nodes now is premature.                                                                                                                                                                                                                                              | Medium                                    |
| D5  | **Custom pointer-event drag & drop**, not HTML5 DnD and not `dnd-kit`                                                                         | HTML5 DnD does not cross iframe boundaries cleanly and gives no control over drop indicators. We need per-pixel insertion-point math anyway.                                                                                                                                                                                                                                               | Medium                                    |
| D6  | **One style serializer shared by runtime and codegen** (`packages/schema/style.ts`)                                                           | Guarantees _preview output === exported code_. This single rule prevents the #1 failure mode of visual builders: the export not matching the canvas.                                                                                                                                                                                                                                       | High                                      |
| D7  | **Registry-driven everything** — palette, props panel, renderer and codegen all read one `ComponentSpec`                                      | Adding a component means adding one file, not touching four subsystems.                                                                                                                                                                                                                                                                                                                    | High                                      |
| D8  | **Generated code targets CSS Modules** by default, with the emitter pluggable (Tailwind emitter later)                                        | Deterministic, readable, no config mapping, no class-name collisions.                                                                                                                                                                                                                                                                                                                      | Low — emitters are swappable by design    |
| D9  | **Own auth**: email + password (argon2), JWT access token + httpOnly refresh cookie                                                           | No third-party keys needed to run locally; workspace/role model is ours anyway.                                                                                                                                                                                                                                                                                                            | Low                                       |
| D10 | **Autosave with an optimistic version check** — ~~JSON Patch~~ the whole document (revised in Phase 8)                                        | Server-side conflict detection is what makes concurrent editing safe, and that is `baseVersion`, not the payload's size. Patches were dropped because D11 leaves none lying around to send: producing one would mean diffing two snapshots on every save purely to shrink a request that is tens of kilobytes. Phase 12's CRDT does not need this to have been patches.                    | Low                                       |
| D11 | **Pure ops + document snapshots** for editor state and undo/redo — ~~Zustand + Immer patches~~ (revised in Phases 4 and 8)                    | `schema/ops` is pure and shares every node it does not touch, so a snapshot costs one object per changed node and an undo is an assignment — no inverse-patch path, and no class of bug where an inverse is wrong. React context carries it rather than Zustand: one provider, one value, and the panels already re-render per document change. See Phase 8's notes.                       | Medium                                    |
| D12 | **Studio chrome is quiet by design** — neutral greys, hairline borders, one accent, no gradients or shadows-as-decoration                     | The canvas is the only thing that should draw the eye. Loud tool chrome competes with the user's own design and makes color judgements unreliable. See §8.                                                                                                                                                                                                                                 | Low                                       |
| D13 | **shadcn's design and API, not shadcn's source** — the library is built on plain CSS with shadcn's token names, variant taxonomy and geometry | Gets the shadcn look and vocabulary without Tailwind in the runtime. shadcn ships no layout primitives (a builder is mostly layout), its overlays are 4–6 compound sub-components that do not map to one node, and its `cn()`/tailwind-merge classes would silently beat the declarations the inspector writes (§9 vs §3). Because the props match 1:1, the shadcn emitter stays a rename. | Low — D8 makes emitters additive          |

### Open choices deferred on purpose

- **Tailwind emitter** for export — Phase 10 stretch, D8 makes it additive.
- **shadcn emitter** for export — same shape: swap `codegen` to `{ importFrom: '@/components/ui/button', tag: 'Button' }` and pass `variant`/`size` through unchanged (D13).
- **Realtime multiplayer (Yjs)** — Phase 12. D3 + D10 keep the door open.
- **Self-hosted publish/CDN** — Phase 12.
- **Slots on a user component** — Phase 12's next piece. See §15; symbols shipped with
  props only, and an instance's `children` array is already there and unread.

---

## 2. Repository layout

```
ui-builder/
├─ apps/
│  ├─ web/                     # Vite + React studio (the builder itself)
│  │  ├─ src/
│  │  │  ├─ studio/            # editor shell: panels, toolbar, layout
│  │  │  │  ├─ canvas/         # iframe host, zoom/pan, overlays, DnD hit-testing
│  │  │  │  ├─ palette/        # left panel: component library + search
│  │  │  │  ├─ layers/         # left panel: tree outline
│  │  │  │  ├─ inspector/      # right panel: styles, props, interactions
│  │  │  │  └─ topbar/
│  │  │  ├─ store/             # zustand slices: doc, selection, ui, history
│  │  │  ├─ routes/            # /, /w/:ws, /p/:project, /preview/:project/:page
│  │  │  └─ api/               # TanStack Query hooks over the REST client
│  │  └─ canvas-frame.html     # document loaded into the canvas iframe
│  └─ api/                     # Fastify + Prisma
│     ├─ src/
│     │  ├─ modules/           # auth, workspaces, projects, revisions, assets
│     │  ├─ plugins/           # jwt, cookie, prisma, error handler
│     │  └─ server.ts
│     └─ prisma/schema.prisma
├─ packages/
│  ├─ schema/                  # THE contract: doc model, zod validators, style
│  │  ├─ doc.ts                #   types + zod schemas
│  │  ├─ ops.ts                #   pure tree operations (insert/move/delete/dup)
│  │  ├─ style.ts              #   StyleSet -> CSS  (shared by runtime + codegen)
│  │  └─ expr.ts               #   binding expression parse/eval/scope
│  ├─ runtime/                 # renders a ProjectDoc as live React
│  │  ├─ Renderer.tsx          #   editing=true (canvas) | false (preview)
│  │  └─ actions.ts            #   event/action interpreter
│  ├─ components/              # built-in component registry
│  │  ├─ registry.ts
│  │  └─ specs/                #   VStack.tsx, Text.tsx, Button.tsx, ...
│  ├─ codegen/                 # ProjectDoc -> VirtualFile[] (React project)
│  └─ tsconfig/                # shared tsconfig bases
└─ package.json                # npm workspaces: apps/*, packages/*
```

Postgres runs on the local install (already present on this machine), configured through
`DATABASE_URL` in `apps/api/.env`. A `docker-compose.yml` is worth adding later purely so a
second developer can start without installing Postgres — it is not needed to build.

**Dependency direction (never violate this):**
`schema` ← `components` ← `runtime` ← `web`
`schema` ← `codegen` ← `web` / `api`
`schema` ← `api`

`schema` depends on nothing. It is the only thing both sides agree on.

---

## 3. The document model

The whole product is a set of editors over this one data structure.

```ts
// packages/schema/doc.ts

export type NodeId = string;

export interface ProjectDoc {
  schemaVersion: number; // migrations run on load
  id: string;
  name: string;
  pages: Page[];
  symbols: SymbolDef[]; // reusable user components (Phase 12)
  theme: Theme; // design tokens
  assets: AssetRef[];
}

/** What a Page and a SymbolDef have in common — the unit every op in `ops.ts` takes. */
export interface NodeTree {
  rootId: NodeId;
  nodes: Record<NodeId, Node>; // D3: flat, normalized
}

export interface Page extends NodeTree {
  id: string;
  name: string;
  path: string; // '/', '/about', '/users/:id'
  state: StateVar[]; // page-scoped state (Phase 11)
  queries: QueryDef[]; // HTTP data sources (Phase 11)
}

/** A component the document owns, with a prop surface. Phase 12; see §12. */
export interface SymbolDef extends NodeTree {
  id: string;
  name: string;
  description: string;
  props: SymbolProp[];
}

export interface Node {
  id: NodeId;
  parentId: NodeId | null;
  type: string; // registry key: 'VStack' | 'Text' | 'Button'
  name: string; // layer name shown in the outline
  children: NodeId[];
  props: Record<string, PropValue>;
  styles: StyleSet;
  events: Record<string, ActionStep[]>; // 'onClick' -> [ ... ]
  repeat?: RepeatSpec; // render once per item in a collection
  showIf?: PropValue; // renders only when this evaluates truthy
  hidden?: boolean; // the author's own toggle in the layers tree
  locked?: boolean;
}

export type PropValue = { kind: 'static'; value: Json } | { kind: 'expr'; code: string }; // evaluated against the render scope

/** breakpointId -> pseudo-state -> declarations. 'base' is the mobile-first default. */
export type StyleSet = Record<string, Partial<Record<StyleState, StyleDecls>>>;
export type StyleState = 'default' | 'hover' | 'focus' | 'active' | 'disabled';
export type StyleDecls = Record<string, string | number>; // camelCase CSS props

export interface Theme {
  colors: Record<string, string>; // token name -> value
  fonts: Record<string, string>;
  space: Record<string, string>;
  radii: Record<string, string>;
  breakpoints: { id: string; label: string; minWidth: number }[];
}
```

### Why `styles` is structured, not a CSS string

`StyleDecls` is a plain object of CSS properties. `packages/schema/style.ts` exports:

```ts
serializeNodeStyles(node, theme): { className: string; css: string }
```

- **Runtime** collects every node's `css`, injects one `<style>` tag into the canvas iframe.
- **Codegen** collects the same `css` into a `Page.module.css`.

Same function, same output. D6 in practice — the canvas cannot drift from the export.

### Tree operations are pure and live in `schema/ops.ts`

```ts
insertNode(page, { node, parentId, index }): Page
moveNode(page, { nodeId, newParentId, index }): Page
deleteNode(page, nodeId): Page          // cascades to descendants
duplicateNode(page, nodeId): Page       // fresh ids, deep
reorder(page, parentId, from, to): Page
```

Pure functions → unit-testable without React, reusable by the API for server-side
validation, and directly wrappable in Immer for patch generation.

---

## 4. Database schema (Prisma)

```prisma
model User            { id, email @unique, passwordHash, name, createdAt
                        memberships WorkspaceMember[] }

model Workspace       { id, name, slug @unique, createdAt
                        members WorkspaceMember[], projects Project[] }

model WorkspaceMember { id, userId, workspaceId, role Role
                        @@unique([userId, workspaceId]) }

enum Role             { OWNER ADMIN EDITOR VIEWER }

model Project         { id, workspaceId, name, slug, thumbnailUrl,
                        currentRevisionId, version Int,   // D10 optimistic lock
                        createdAt, updatedAt, archivedAt? }

model ProjectRevision { id, projectId, doc Json, version Int, label?, authorId,
                        createdAt
                        @@index([projectId, version]) }   // immutable history

model Asset           { id, projectId, url, mimeType, width?, height?, bytes }

model RefreshToken    { id, userId, tokenHash, expiresAt, revokedAt? }

model Publish         { id, projectId, revisionId, slug @unique, publishedAt }
```

**Revision strategy:** every autosave updates `Project.version` + writes the doc.
A new `ProjectRevision` row is written on a throttle (max 1 per ~60s) plus on every
explicit "Save version" — so history is useful without one row per keystroke.

---

## 5. Canvas architecture (the hard part)

```
┌─ Studio window (React root #1) ───────────────────────────────┐
│  Palette │  ┌─ Viewport (pan/zoom transform) ──┐  │ Inspector │
│  Layers  │  │  ┌─ <iframe> (React root #2) ─┐  │  │           │
│          │  │  │   <Renderer editing />     │  │  │           │
│          │  │  └───────────────────────────┘  │  │           │
│          │  │  ┌─ Overlay layer (absolute) ─┐  │  │           │
│          │  │  │ selection box, drop line,  │  │  │           │
│          │  │  │ resize handles, labels     │  │  │           │
│          │  │  └───────────────────────────┘  │  │           │
│          │  └─────────────────────────────────┘  │           │
└───────────────────────────────────────────────────────────────┘
```

**Rules that keep this sane:**

1. **Two React roots, one store.** The iframe mounts its own `createRoot`. It does
   _not_ share React context with the parent (context does not cross realms reliably).
   It subscribes to the same Zustand store instance, passed through
   `iframe.contentWindow.__STUDIO__ = store` on load. Same-origin, so this is legal.
2. **Overlays live in the parent, never in the iframe.** Drawing selection chrome
   inside the iframe would pollute the user's DOM and break codegen fidelity.
3. **Rect math.** Overlay position =
   `elRect (from iframe) * zoom + iframeOffsetInParent`.
   Every measurement helper goes through one `toStudioSpace(rect)` function. Never
   inline this math — it is where zoom bugs come from.
4. **Zoom** is `transform: scale(z)` on the iframe wrapper with
   `transform-origin: 0 0`. Pan is `translate()`. `Ctrl/⌘+wheel` zooms toward cursor,
   `Space+drag`, middle-drag, dragging the backdrop, and trackpad two-finger pan.
5. **Hit-testing** uses `iframeDoc.elementsFromPoint(x/z, y/z)` and walks up to the
   nearest element carrying `data-node-id`.

---

## 6. Drag & drop model

Two sources, one target system.

- **New node** — drag from palette. Payload: `{ kind: 'new', componentKey }`.
- **Move** — drag an existing canvas node or a layers-tree row. Payload: `{ kind: 'move', nodeId }`.

**Drop resolution algorithm** (runs on every pointermove, throttled to rAF):

1. Hit-test the point → candidate element → `nodeId`.
2. Walk up until a node whose spec says `acceptsChildren`.
3. Read that container's computed `flex-direction` (or `grid`).
4. Compare the cursor against each child's rect **along the main axis**:
   - inside the first 25% of a child → insert _before_ it
   - inside the last 25% → insert _after_ it
   - middle 50% **and** the child accepts children → descend into it
5. Emit `{ parentId, index }` and draw a 2px indicator line at the computed gap.
6. Guard: reject a drop where `newParentId` is a descendant of the dragged node.

The line alone says _where_ but not _what next to_, so the target also carries a
`context`: the receiving container's name and bounds, and the nearest sibling that is
not the node in flight. The overlay draws that as a faint outline around the container
plus a label on the line — "after Card", or "into Stack" where there is no sibling to
name. Both drag surfaces answer with it, from `dnd/dropContext.ts`.

**Empty containers** get a dashed placeholder with a minimum hit area so an empty
`VStack` is still a droppable target.

---

## 7. Component registry

One spec per component. This single object feeds the palette, the search index, the
props panel, the renderer, and the code generator (D7).

```ts
export interface ComponentSpec<P = any> {
  key: string; // 'VStack' — stable, used in the doc + codegen
  displayName: string; // 'Vertical Stack'
  category: 'Layout' | 'Basic' | 'Form' | 'Data' | 'Media' | 'Overlay';
  icon: LucideIcon;
  keywords: string[]; // fuzzy-search fuel: ['column','flex','vbox']
  component: React.ComponentType<P>; // what the runtime renders

  props: PropSpec[]; // drives the auto-generated inspector
  events: string[]; // ['onClick', 'onMouseEnter']
  acceptsChildren: boolean;
  isVoid?: boolean; // img, input — no children ever
  layout?: 'flex' | 'grid'; // set by the library's own CSS, not by the document

  defaultProps: Record<string, Json>;
  defaultStyles: StyleDecls;

  codegen: {
    importFrom?: string; // undefined => emit a plain intrinsic element
    tag: string; // 'div' | 'button' | 'Button'
  };
}

export type PropSpec =
  | {
      name: string;
      label: string;
      type: 'string' | 'text' | 'number' | 'boolean' | 'color' | 'url' | 'icon';
    }
  | { name: string; label: string; type: 'enum'; options: { label: string; value: string }[] }
  | { name: string; label: string; type: 'object'; fields: PropSpec[] };
```

### Built-in library (Phase 5 scope)

Shipped components are in **bold**.

| Category    | Components                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Layout**  | **`VStack`**, **`HStack`**, **`Grid`**, **`Box`**, **`Spacer`**, **`Divider`**, **`Header`**, **`Footer`**, **`SideNav`**, `Scroll` |
| **Basic**   | **`Text`**, **`RichText`**, **`Heading`**, **`Button`**, **`Link`**, `Icon`, **`Badge`**, **`Avatar`**                              |
| **Form**    | **`Input`**, **`Textarea`**, **`Select`**, **`Checkbox`**, **`Radio`**, **`Switch`**, **`Slider`**, **`DatePicker`**, `Form`        |
| **Media**   | **`Image`**                                                                                                                         |
| **Data**    | `List` (repeat), **`Table`**, **`Card`**                                                                                            |
| **AI**      | **`ChatThread`**, **`ChatMessage`**, **`PromptInput`**, **`TypingIndicator`**, `CodeBlock`, `Citation`, `SourceCard`, `ToolCall`    |
| **Overlay** | `Modal`, `Drawer`, `Tooltip`, `Tabs`, `Accordion`                                                                                   |

Per D13 the implementations are shadcn's design, not shadcn's source: `Button` takes
`variant` (`default | secondary | outline | ghost | destructive | link`) and `size`
(`sm | default | lg | icon`), styled against `--primary`, `--muted-foreground`,
`--ring` and the rest of the shadcn token set that `serializeTheme` emits.

The compound components (`Tabs`, `Modal`, `Accordion`) are the ones that do not map to
a single node and will need insert-time subtree templates — the reason they are not in
the first batches. `Select` shipped ahead of them as a native `<select>` whose options
are authored as text: a list of choices is data, and editing it in one field beats
dropping six `Option` nodes. shadcn's compound Select can replace it later without the
document changing, since the options already live in a prop rather than in children.

`Radio` ships as one node holding the whole group, `Select`'s trade for `Select`'s
reason: a list of choices is data. It is also what makes the group correct, since radios
that share a `name` are one control and a user assembling them from separate nodes gets
no warning when they do not. `DatePicker` is the native `<input type="date">` with its
three siblings (`time`, `datetime-local`, `month`) behind one `kind` prop — a calendar
popover is an overlay, and overlays are the batch this table defers behind subtree
templates. It can replace this later with no stored document changing, since the value
already lives in a prop.

`RichText` is a block of formatted copy authored as Markdown, parsed by
`components/markdown.ts` into a tree that the runtime renders as React elements and
`codegen` prints as static JSX — from the same parse, so D6 holds by construction. There
is no `dangerouslySetInnerHTML` anywhere in the path and the exported project ships no
Markdown parser. A WYSIWYG surface is a separate piece of work (a selection model that
has to survive the canvas iframe) and can be built against exactly this prop, because
the content is already a string rather than a subtree. The subset is deliberate:
headings, paragraphs, lists, quotes, fenced code, rules, and inline emphasis, code and
links. Raw HTML is excluded permanently rather than pending — passing it through would
reintroduce the injection surface the tree exists to remove.

`SideNav` was not in this table originally and is here because it was asked for. It
follows `Radio`'s pattern rather than `Card`'s: the links are authored as text (`/path |
Label`) instead of assembled from `Link` children, because a list of destinations is
data — and because _which one is current_ is a fact about the whole set. A nav built out
of separate nodes would have that fact nowhere to live, so the author would style one
child by hand and redo it on every page. It emits real anchors with real `href`s, so the
exported project navigates with nothing wired up. `codegen` grew a third named transform
for it (`navItems`, beside `options` and `radios`) for the reason those exist: the shape
depends on what was typed, and a static template cannot describe "one of these per line".

`Header` and `Footer` join it as the rest of the page chrome, and they inherit its trade
wholesale — the links are text, and `navItems` now carries the class each anchor wears so
that one transform serves all three (a footer link is body text; a side-nav item is a
filled row). Each is one node rather than an `HStack` of an `Image`, some `Link`s and a
`Button`, for `ChatMessage`'s reason: the groups have to stay pinned to their ends as
their contents change, which is a `margin-left: auto` and a flex row the author would
otherwise have to know to set, and clearing the call to action would silently re-centre
the links. Both take a logo and a wordmark, either alone or together, and both drop the
brand block entirely when both are cleared rather than leaving an empty anchor holding a
flex gap open — the emit vocabulary grew an `any` condition beside `all` for that. The
header's action is an anchor wearing the `Button` classes, not a `<button>`: a header
action goes somewhere, and a shipped button waiting for an `onClick` nobody wrote is a
control that does nothing in the exported project. The footer is given no `active` prop
at all, which is the transform's signal that this list has no current item — a footer
says where a site goes, not where the reader is.

`Table` takes the same trade one step further: the columns are a line of `Name | Role |
Status` and the rows are one line each, because a grid of values is data and forty cells
assembled as forty nodes would be forty things to select, align and keep in step — and
the fact that makes it a table, that every row has the same columns, would live nowhere.
The width is the longest line rather than the header's, so an extra cell widens the table
instead of being silently eaten, and everything shorter is padded rather than left ragged.
A leading or trailing pipe is dropped, so a table pasted out of Markdown arrives with the
columns someone can see. Its variants are custom properties on the table read by the cells
rather than descendant selectors, since `.ub-table-cell` qualified by the table's variant
would weigh two classes and out-specify the node's own rule — the one thing `css.ts` is
arranged to prevent.

Its rows can be dragged into a new order, and that is the first thing this library exports
that is **behaviour rather than markup**. Everything else is a static tree, which is what
lets the emit templates be inert data (§11); dragging needs state and event handlers, and
a template vocabulary that could describe those would have stopped being data. So `emit.ts`
grew `EmitModule` — a file the export ships alongside its pages, reached for by
`EmitElement.from` — and the rule that keeps the hatch narrow is that such a module must be
a _wrapper_: `SortableRows` renders nothing but the `<tbody>`, and every row, cell and
handle inside it comes from the same template that writes the static version. So D6 holds
by construction — the canvas and the export render the same elements and differ only in
whether one can be picked up. The component is written twice, once as React and once as a
string, and `runtime.test.ts` asserts the two are the same code from the first import down,
so they cannot drift. A table nobody drags emits a plain `<tbody>` and ships no JavaScript
at all, and a document with no such component gets no `src/components` directory.

Because dragging is real, the canvas has to stop it: the gesture that picks up a row is the
gesture that moves the node. `ComponentSpec.interactive` is how a spec says so, and
`isDesignTimeControl` reads it beside the Form rule, which delivers `readOnly` to the
component exactly as it does to a text field. The handles are still drawn while editing —
they are part of the design — and only the dragging is withheld. Reordering also works from
the keyboard (arrow keys while a handle has focus), because a pointer-only control that
changes what the page says is one a keyboard user cannot operate at all.

`Form` is the remaining gap in that category and is deliberately last: an inert `<form>`
wrapper is worth little until Phase 11 gives it an `onSubmit` action to carry.

`Icon` is the remaining gap in Basic. It needs a `PropSpec` type this file's union does
not have yet (`icon`) plus a picker in the inspector. Phase 7 built the inspector and
did **not** build it: the picker is half a day, but it cannot be written until the
library's icon set is chosen, and shipping all ~1500 of lucide's icons to render one is
a bundle decision that belongs with the component library rather than with the panel.

**AI** is the one category whose members are compositions rather than primitives — a
`ChatMessage` is an avatar, a name and a bubble that someone could have assembled out of
`Basic` by hand. They are components anyway because `role` has to move four things at
once (which side the row sits on, how the bubble is coloured, whether the avatar shows,
and whether the body is a bubble or a centred system line), and because `PromptInput`'s
surface is its _wrapper_ — a borderless field and a button on one painted card is not
something a `Textarea` beside a `Button` can be styled into. `ChatMessage` authors its
body as a `text` prop for the reason `Select` authors its options as text: a message is a
paragraph someone types, not a subtree they assemble. Rich assistant output is what a
later `acceptsChildren` pass is for, and it can be added without any stored document
changing, since `text` stays the empty-children rendering. `CodeBlock` and the rest of
the row are the natural next batch.

`layout` exists because the inspector has to know how a component arranges its children
before the canvas has painted, and for `VStack`/`Grid`/`Card` that fact lives in
`css.ts` rather than in any node. See Phase 7's notes.

`VStack`/`HStack` are thin flex wrappers exposing `gap / align / justify / wrap` as
first-class props so the common case needs zero raw CSS.

### Search (requirement #4)

`fuse.js` index over `displayName + keywords + category`, weighted toward
`displayName`. Grouped results by category, `↑↓` navigate, `Enter` inserts into the
current selection, `Ctrl/⌘+K` focuses. Zero-result state offers "insert as Box".

---

## 8. Studio design language

The studio must look like a tool, not like a website. Plasmic, Figma and Webflow all land in
the same place for the same reason: **the canvas is the only saturated thing on screen.**

**Rules (D12):**

- **One accent, used sparingly.** A single blue for selection, focus rings, active tabs and
  primary buttons. Nothing else is colored. Selection chrome on canvas uses this same blue so
  the eye reads "selected" instantly.
- **Neutral greys with a faint cool bias.** Panel background a half-step off white, canvas
  backdrop a half-step darker so the artboard reads as a lifted surface. Dark theme is the same
  system inverted, not a different design.
- **Hairlines, not shadows.** 1px borders separate panels. Shadows appear only on things that
  genuinely float — dropdowns, popovers, the drag ghost.
- **Dense but not cramped.** 28px row height for inspector fields, 24px for layer rows, 11–13px
  UI text. Labels are sentence case, left-aligned, in the muted grey; values are near-black.
- **Small radii.** 3–4px on inputs and buttons. Nothing pill-shaped, nothing at 12px+.
- **Icons over words** in the toolbar and layer tree, always with a tooltip. Words in the
  inspector, where precision matters more than density.
- **No decoration.** No gradients, no glass, no emoji, no illustrative empty states. An empty
  canvas says "Drag a component here" in muted grey and nothing more.
- **Motion is functional only.** Panel open/close and dropdown transitions at 120–150ms.
  Nothing animates on the canvas except drag feedback.

Implementation: a small token file (`apps/web/src/styles/tokens.css`) of CSS custom properties
for color, space, radius and type; plain CSS Modules for studio components; Radix UI primitives
for the behavior of menus, popovers, tabs, tooltips and sliders — unstyled, so the look is ours.
Tailwind is deliberately **not** used, so there is no ambiguity between "studio styles" and the
CSS the builder generates for the user.

---

## 9. Inspector (right panel)

Tabs: **Design** · **Props** · **Interactions**

**Design** (writes to `node.styles[breakpoint][state]`):

- Layout — display, flex direction, align, justify, gap, wrap
- Size — w/h/min/max, aspect ratio, overflow
- Spacing — visual margin/padding box editor
- Typography — family, size, weight, line-height, letter-spacing, align, color
- Background, Border & radius, Shadow, Opacity
- Position — static/relative/absolute/fixed/sticky + offsets, z-index

Every control is token-aware: a color field offers `theme.colors` first, raw hex second.
A **breakpoint switcher** and a **state switcher** (default/hover/focus/active) sit at
the top of the panel; edits land in whichever cell is active, and any non-base cell
shows an "overridden" dot with a reset action.

**Props** — auto-generated from `ComponentSpec.props`. Nothing hand-written per component.

**Interactions** — event → action list editor (Phase 11).

---

## 10. Interactions, state & data (requirement #8)

```ts
export interface StateVar {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  initial: Json;
}

export interface QueryDef {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string; // supports {{state.x}} interpolation
  headers?: Record<string, string>;
  body?: string;
  runOnLoad: boolean;
}

export type ActionStep =
  | { kind: 'setState'; stateId: string; value: PropValue }
  | { kind: 'toggleState'; stateId: string }
  | { kind: 'runQuery'; queryId: string }
  | { kind: 'navigate'; to: PropValue }
  | { kind: 'showToast'; message: PropValue }
  | { kind: 'custom'; code: string };
```

Three changes from the sketch this section first carried, all made while building it.
A step's values are `PropValue`, not a separate `Expr` type, so `navigate to '/about'`
is a literal and `navigate to {{ state.next }}` is an expression — edited by the one
control that already edits props. A step names its state variable and its query by
**id**, so a rename cannot silently break every handler that used it (expressions still
reference state by name, because expression text is free-form and nothing can rewrite
it safely — which is what the panel's usage list is for). And `openOverlay`/
`closeOverlay` are absent until there are overlay components to open: a step kind the
runtime cannot execute is one the editor would happily let someone author. Adding a
member later is not a migration, since no stored document can contain one.

**Render scope** — every expression evaluates against:

```ts
{
  (state, queries, item, index, props, theme);
}
```

`item`/`index` exist only inside a `repeat`. Expressions are authored as `{{ ... }}`
in any text/prop field and stored as `{ kind: 'expr', code }`, where `code` is the
**template source** — exactly what was typed, holes and all, so a field round-trips
without an inverse compiler. A hole standing alone yields the raw value (`{{ state.busy }}`
on `disabled` is `false`, not the string `"false"`); mixed content is a string.

**Evaluation:** `new Function('scope', 'with(scope){ return (' + code + ') }')`
inside the canvas iframe (already sandboxed from the studio). Errors are caught per
node and surfaced as a red badge on that node, never as a crashed canvas.

**Codegen** turns state into `useState`, queries into a `useQuery`-shaped hook, and
action lists into a plain handler function body. Because actions are a small, closed
union, the emitted code is readable — not an interpreter shipped to the user.

---

## 11. Code generation (requirement #7)

```ts
generateProject(doc: ProjectDoc, opts): VirtualFile[]   // pure, no I/O
```

Emitted project:

```
package.json          vite.config.ts       index.html      tsconfig.json
src/main.tsx          src/App.tsx          # router over doc.pages
src/theme.css         # CSS variables from doc.theme
src/library.css       # the component library's own rules, shipped verbatim
src/pages/Home.tsx    src/pages/Home.module.css
src/components/...    # a component that is behaviour, not markup (SortableRows)
src/lib/...           # values, query, toast, navigate — Phase 11's runtime
```

The last two directories appear only in a project that reaches for them, and most do not.
`src/components/` is the `EmitModule` hatch (§7); `src/lib/` is what a page with state,
requests or bindings needs, and each of its four files is shipped independently — a page
with one binding and no queries gets `values.ts` alone.

**Pipeline:** doc → IR (`JsxElement` tree) → string. The printer formats on the structure
it already knows rather than handing the result to Prettier, which is what keeps
`generateProject` synchronous and dependency-free — the same function runs in the studio's
code panel, in the API's zip route and in a snapshot test. Building an IR first (rather
than concatenating strings) is what makes conditional rendering, `repeat` → `.map()`, and
expression inlining tractable — `when` and `map` are IR nodes for exactly that reason.

**Fidelity rule (D6):** the CSS in `*.module.css` is produced by the _same_
`serializeNodeStyles` the canvas uses. Snapshot tests in `packages/codegen` assert
that a fixture doc produces byte-stable output, and a Playwright test screenshots
canvas vs. built export and diffs them.

The same rule for **bindings**, which have no shared function to point at: `src/lib/values.ts`
ships to a stranger and so cannot import this repo, and is therefore a second copy of
`stringifyValue`, `isTruthy`, `asEnum` and `initialsOf`. `values.test.ts` runs both copies
over the same table of awkward values — a number on a text prop, an empty array in a
condition, a null on a number prop — which is the only thing that would notice them
drifting. The expression _text_ needs no such care: nothing rewrites it, and the generated
component defines `state`, `queries`, `item` and `index` around it (§10).

Delivery: `GET /projects/:id/export` streams a zip; the studio also shows a read-only
code panel per page (generated in-browser, same function).

---

## 12. Build phases

Each phase is independently demoable. Do not start the next until acceptance passes.

### Phase 0 — Foundations ✅ done

Monorepo (npm workspaces), TypeScript configs, ESLint/Prettier, Vitest, `.env` handling,
the studio token file from §8, and root scripts (`dev`, `build`, `test`, `db:*`).
Create the `ui_builder` database on the local Postgres install and point
`DATABASE_URL` at it.
**Done when:** `npm run dev` starts web on :5173 and api on :3000; `/health` returns ok
against the local Postgres.

**Verified:** `/health` returns
`{"status":"ok","schemaVersion":1,"checks":{"database":{"ok":true,"latencyMs":1}}}`
both directly on :3000 and through the Vite proxy on :5173. Typecheck, lint, tests
(4) and production builds all pass.

Notes from doing it, so they are not rediscovered later:

- Versions are ahead of where the plan assumed: TypeScript 6, ESLint 10, Vitest 4,
  Vite 8, React 19.2, Fastify 5.12, **Prisma 7**, Zod 4.
- Prisma 7 moves the connection URL out of `schema.prisma` into `prisma7.config.ts`
  and talks to Postgres through a driver adapter (`@prisma/adapter-pg`), not an
  engine binary. The client is generated to `apps/api/src/generated/prisma`.
- `tsx watch` silently fails to bind under `concurrently` on Windows — the process
  survives but never listens and prints nothing. The API dev script uses
  `node --watch --import tsx` instead. Do not change it back.
- Vite binds `localhost` to IPv6 `::1` here, so `127.0.0.1:5173` refuses connections
  while `localhost:5173` works. The Vite→API proxy target stays on `127.0.0.1:3000`,
  which is where Fastify binds.

### Phase 1 — Backend core (requirement #1) ✅ done

Prisma schema + migrations. Auth: register / login / refresh / logout / me.
Workspaces CRUD + membership + role guard. Projects CRUD scoped to a workspace.
Zod-validated routes, typed error envelope, pino logging.
**Done when:** an integration test suite registers a user, creates a workspace,
creates a project, and a second user gets 403 on it.

**Verified:** that exact walk-through is
`apps/api/src/modules/projects/projects.test.ts` — "walks register → workspace →
project, and keeps a second user out". 92 tests pass across 8 files; typecheck and
lint are clean.

Notes from doing it:

- Roles are a capability table (`lib/roles.ts`) rather than inline comparisons, so a
  route declares _what it needs_ (`REQUIRES.projectWrite`) and never _who may do it_.
- `not_found` vs `forbidden` is deliberate: a non-member gets 403 for a workspace
  that exists and 404 for one that does not — the id is not a secret, membership is.
- Removing a member and leaving a workspace are the same route, guarded at viewer
  level, because a viewer must be able to do the second. The rule (act on yourself,
  or on someone you outrank) lives in the service.
- Integration tests truncate every table discovered from `pg_tables` between tests
  rather than a hand-listed set, so a new model cannot silently leak rows.
- `slugify` needs an explicit fold table: NFKD leaves `ß`, `æ`, `ø`, `ł` intact
  because they are letters, not accented forms, so they were being dropped
  entirely ("Straße" → "stra-e"). Accents alone would have hidden this.

### Phase 2 — Studio shell (requirement #5, layout only) ✅ done

Auth screens, workspace switcher, project grid, and the three-pane editor frame with
resizable panels and a top bar — built against the §8 tokens, so the chrome is quiet
from the first commit rather than restyled later. No canvas yet — placeholders.
**Done when:** you can log in, create a workspace and project, and open its editor.

**Verified** by driving a real browser through it (Playwright): sign up validation,
sign in, create workspace, create project, open the editor, rename/archive/restore
from the row menu, workspace switcher, sign out. A reload inside the editor stays in
the editor; a signed-out deep link lands on `/login`. Light and dark both render;
no console errors beyond the expected 401 from the cold-start refresh probe.

Routing is `/login`, `/signup`, `/`, `/w/:workspaceSlug`, `/p/:projectId`.

Notes from doing it:

- **The access token is memory-only.** Persisting it to localStorage would put a
  bearer credential where any script can read it, and the httpOnly refresh cookie
  already survives a reload. The cost is that a page load starts with _no_ session
  and must ask — so `user` has three states, not two: `undefined` (restoring),
  `null` (nobody), and the user. `RequireAuth` treating `undefined` as signed-out
  would bounce every refresh to sign-in; that distinction is the load-bearing part.
- Refresh returns the user as well as the token, so restoring a session is one
  request, not refresh-then-`/me`.
- The role capability table (`hasAtLeast`/`REQUIRES`) moved from `apps/api/src/lib`
  into `packages/schema`. The studio needs the same answers to decide what to
  render, and a second copy would drift. The server still enforces; the client only
  decides what to offer.
- Panel resizing uses pointer capture, not window listeners — the handle keeps
  receiving events when the pointer outruns it, which is how hand-rolled splitters
  usually get stuck mid-drag. Sizes persist per machine in localStorage.
- The undo/redo, zoom and preview controls are in the top bar now, disabled. Their
  width is what decides how much room the project name gets; discovering that after
  Phase 8 would mean rebuilding the row.
- Radix supplies menu and dialog _behaviour_ only. All appearance is ours, in two
  CSS modules, so every menu in the studio cannot drift apart.

### Phases 3–6 — a vertical slice first ◑ in progress

Phases 3 through 6 were opened together as one demoable slice — the minimum of each
that makes dragging work end to end — rather than completed one at a time. The
reasoning: the drop-resolution rules in §6 are the part most likely to be wrong, and
they cannot be judged at all until there is a document, a renderer, a canvas and a
palette to exercise them against. Building the full Phase 3 and 4 first would have
meant designing all four against guesses.

**Shipped in the slice:**

- **Phase 3** — `schema/doc.ts` (types + zod), `ops.ts` (insert, move, delete,
  duplicate, reorder, style/prop writes), `style.ts`, `theme.ts`; `packages/runtime`
  renders a page to DOM. 149 tests pass.
- **Phase 4** — iframe host with a React portal, hover and selection overlays with
  labels, click-to-select, keyboard focus ownership; the Layers tree — outline, reveal,
  arrow-key navigation, inline rename, hide/lock, and drag as a third surface; pan/zoom
  with `toStudioSpace` (below). Multi-select closed it later — see its own section below.
- **Phase 5** — `packages/components` with 19 components (Box, VStack, HStack, Grid,
  Spacer, Divider, Heading, Text, Button, Link, Badge, Avatar, Input, Textarea, Select,
  Checkbox, Switch, Card, Image), the registry, category grouping, and search.
  **Not yet:** `Icon` (waits on the `icon` prop type), `Scroll`, `Radio`, `Slider`,
  `Form`, `List`, `Table`, the five Overlay components, keyboard nav through results.
- **Phase 6** — pointer drag controller across both documents, hit-testing,
  insertion-index math, line and box indicators, drag ghost, descendant guard, Esc to
  cancel, and the layers tree as a third source and target.

**Verified** by driving a real browser (Playwright): drag `VStack` into the empty
root, `Heading` into the stack, `Button` below the heading; click-insert `Text`;
drag the button back above the heading on the canvas; search "col" → Vertical Stack;
delete a subtree with the keyboard. Typecheck, lint, 149 tests and the production
build all pass; no console errors beyond the expected cold-start 401.

Notes from doing it, so they are not rediscovered later:

- **The iframe is a separate realm, so `instanceof` is a trap.** `target instanceof
Element` is _false_ for every element on the canvas, because the frame has its own
  `Element` constructor. It fails silently — selection and hover simply never fire.
  Hit-testing duck-types (`typeof el.closest === 'function'`) instead. Anything new
  that inspects a canvas event must do the same.
- **One drag gesture spans two documents.** A press in the palette is captured by the
  studio's document, a press on the canvas by the frame's, and the pointer can then
  cross into the other — which never sees the first one's events. A drag session
  listens on both surfaces and each converts its own coordinates to studio space.
- **`preventDefault` on the frame's pointerdown keeps the design inert, but it also
  freezes focus.** After typing in the palette search, focus was still in the input,
  so Delete deleted a character rather than the selected node. Selecting on the canvas
  now explicitly moves focus to the canvas area (`tabIndex={-1}`).
- **The move index counts the dragged node itself.** The drop resolver measures the
  list the indicator was drawn over, which still contains the node being moved;
  `moveNode` compensates for its own removal. Making callers pre-adjust is the classic
  "drops one slot short when moving right" bug, and it is covered by a test.
- `packages/schema` compiles against bare ES2023 — no DOM lib, no Node types — so it
  cannot leak an environment into the contract the API, studio and codegen share.
  `crypto` and `structuredClone` are not in that lib; the first is reached for
  narrowly with a fallback, the second replaced by a local `cloneJson`.
- The library's CSS is a plain exported string, not a CSS Module, because it has to
  reach the canvas iframe, the preview and the export — none of which a bundler sees
  into. The cost is that nothing type-checks it: a stray backtick in a comment
  silently terminated the template literal and 500'd the dev server. `css.test.ts`
  now asserts balanced braces, no backticks, a rule for every enum option a spec
  offers, and that no `var(--token)` is used that the theme does not define.
- `html, body { height: 100% }` is in the library reset, not the editor's CSS. A root
  styled `min-height: 100%` collapses without it — on the canvas _and_ in the export.
- **Two drop surfaces need an order, not a set.** The canvas resolver answers for _any_
  point — a hit-test that misses falls back to the page root — so it can never be asked
  first. `DROP_SURFACES` in `state/context.ts` fixes the order (layers, then canvas) and
  every resolver returns null outside its own bounds, which is what makes that total.
- **`preventDefault` on `pointerdown` also cancels the double-click.** It suppresses the
  compatibility mouse events, and double-click-to-rename is one of them. The palette can
  afford it; a layer row cannot, so the row stops text selection with `user-select`
  instead and calls `focus()` on the tree explicitly.
- **Legality and geometry had to be separated.** The canvas and the tree work out
  _where_ a drop lands completely differently, but if they disagree about what is
  _allowed_ the indicator promises drops the commit refuses. `dnd/rules.ts` is the one
  copy of `canReceive`/`canDrag`; each resolver keeps only its own arithmetic.
- **`hidden` and `locked` are inherited, not per-node.** The renderer already skips a
  hidden subtree, so a lock that covered only the node it was set on would still let a
  click inside a locked card drag the heading out of it.

#### Pan and zoom ✅ done

`canvas/viewport.ts` is the one place the three coordinate spaces meet — frame space
(what a rect inside the iframe measures), area space (offsets in the scrollport the
artboard floats in) and studio space (client coordinates, where every overlay lives).
`useViewportGestures` wires the four inputs to it: ctrl/⌘+wheel and trackpad pinch,
plain wheel and two-finger pan, space-drag and middle-drag, and the toolbar's
−/percentage/+ with ⌘−, ⌘+, ⌘0 and ⌘1.

**Verified** by driving a real browser (Playwright) with the browser itself as the
oracle: Playwright reports an element inside the iframe in _main-frame_ coordinates,
computed through the scene's CSS transform, so comparing the selection outline against
it tests `toStudioSpace` against something that does not share its arithmetic. Twenty
assertions pass — the artboard opens fitted at 81% and fully visible; the outline hugs
its node at 81%, 150%, 212% and 100%; a ctrl+wheel leaves the design point under the
cursor within 0.6px of where it was; a plain wheel pans by exactly its delta; space-drag
pans by exactly the pointer's travel; ⌘0 and ⌘1 land on 100% and the fit; and palette
drags land correctly both while zoomed out and after panning and zooming. Typecheck,
lint, 200 tests and the production build all pass.

Notes from doing it, so they are not rediscovered later:

- **The pan offset never appears in a conversion.** The transform is applied by the
  browser to a real element, so the frame's own `getBoundingClientRect()` already
  accounts for it; a projection only has to add back the _scale_, which rects measured
  inside the frame do not know about. Reading the frame rect per call rather than
  caching it is what makes that true — pan, zoom and a panel resize all move it without
  firing anything a cache could subscribe to.
- **A pan must be measured from where it started, not summed move to move.**
  Accumulating deltas makes every single event load-bearing: one coalesced or dropped
  `pointermove` and the canvas is permanently offset by that much. It happened — the
  canvas landed one 7.5px step short of the cursor, and adding a `console.log` to
  diagnose it made it stop, which is the signature of the race. An absolute anchor
  (origin viewport + origin pointer) recovers on the very next move.
- **The frame has to be made inert before the next pointermove, not on the next
  render.** Its client coordinates travel _with_ the pan, so a move it received would
  report a delta of zero. `pointerEvents` is therefore set on the element imperatively
  at pan start; the React class covers every other case (drag, space held).
- **React attaches `wheel` listeners passively**, and a passive listener may not call
  `preventDefault` — which is the whole job. Both wheel listeners are registered by
  hand with `{ passive: false }`. A trackpad pinch arrives as a wheel with `ctrlKey`
  set, so the mouse modifier and the pinch are one branch.
- **Thickness is chrome, length is design.** A drop indicator's span scales with the
  zoom and its 2px thickness does not, so the two are computed separately rather than
  one rect being projected. The same rule keeps the selection outline out of the
  transformed scene: a 2px outline would be 0.5px at 25%.
- The edge band that means "beside this, not inside it" stays in _frame_ pixels. The
  outer quarter of a card is the same part of that card at any zoom; a band in studio
  pixels would swallow a small container whole at 300%.
- The artboard's size is fixed (1024×768) rather than "however big the panel is". A
  design's width is a property of the design — a layout that reflows when the inspector
  is dragged cannot be judged. Phase 9's device presets are a control over that number,
  not a change to the model. Its hairline is an `outline`, not a `border`, so it cannot
  eat into the box the frame is sized to.
- Zoom-to-fit is capped at 100%: scaling a design _up_ to fill a wide monitor makes
  every judgement about type size wrong.

**Remaining to close these phases:** the rest of the §7 component table.

### Phase 7 — Inspector & style system (requirement #5) ✅ done

Design tab (Layout, Size, Spacing, Typography, Background, Border, Effects, Position),
auto-generated Props tab, theme colour picker, breakpoint + state switchers, override
dots with reset, and the box-model spacing editor. `schema/cascade.ts` resolves a
declaration back out of the style set and says where it came from, which is what every
field's placeholder, dot and reset are built on.

**Verified** by driving a real browser (Playwright), 18 assertions: a Design-tab colour
reaches the canvas; the override dot appears and its reset restores the inherited
value; a node style beats the component library's own default; clicking an active
segment clears it; picking `md` resizes the artboard to 768px and a `flex-direction`
written there lays the stack out in a row; returning to `base` shows a column again and
a 1024px artboard; a `hover` background is previewed on a canvas that swallows real
hovers, and switching back to Default stops forcing it; a Props-tab edit reaches the
canvas; the spacing box writes a single edge. Typecheck, lint, 225 tests and the
production build all pass; no console errors beyond the expected cold-start 401.

**Not done:** `Icon` and its `icon` PropSpec type, which §7 had parked on this phase —
the picker is small but the library's icon set has to be settled first, and that is a
bundle-size decision, not an inspector one. Expression-valued props (`kind: 'expr'`)
are Phase 11; every field here writes `kind: 'static'`.

Notes from doing it, so they are not rediscovered later:

- **Specificity, not source order, decides — and the library was winning.** The
  renderer emits the library sheet first and per-node rules last, which is only enough
  while both weigh the same. `.ub-stack[data-direction='vertical']` weighs a class _and_
  an attribute, so it out-specified `.ub-n-<id>` and the Design tab silently could not
  change `flex-direction` on the two components people use most. Every `[data-*]` in
  `css.ts` is now wrapped in `:where()`, which is how CSS says "this is a default";
  `css.test.ts` fails on a bare one, and on any `!important`.
- **An inline style beats every stylesheet.** `Stack` and `Grid` set `gap` inline from
  their prop, so a gap typed into the inspector did nothing. Both now render
  `data-gap`, matched by a rule — the same shape as `align` and `justify` already had.
- **The panel cannot decide what to show by reading the document alone.** A `VStack` is
  `display: flex` because of a rule in `css.ts`, with nothing in the node saying so, so
  gating the flex controls on the node's resolved `display` hid `align-items` on
  exactly the components it exists for. `ComponentSpec.layout` declares it instead, and
  the document still wins when it says anything — setting Display to `block` on a stack
  closes those rows.
- **A field shows its own value or nothing.** Rendering the inherited value as content
  makes every breakpoint look fully specified and leaves no way to tell a value that is
  _set_ from one that merely _applies_. The inherited value is the placeholder, greyed;
  typing over it is what takes the property over. `resolveDecl` returns the origin so
  that distinction is made once rather than per field.
- **A CSS length is not a number, so the fields are not number inputs.** `auto`, `50%`,
  `2rem` and `var(--space-4)` all have to be typeable in the same box. A bare number
  becomes a `number` in the document (the serializer appends `px`), anything else stays
  a string, and empty clears the property — arrow-key stepping is added back by hand
  for the case where the value is a bare number.
- **Fields commit on blur and Enter, never per keystroke.** Otherwise `1`, `16`, `16p`,
  `16px` all reach the document, three of them meaningless — and all four become undo
  steps once Phase 8 lands. Escape abandons the edit. The multi-line prop control
  commits on blur _only_: Enter is a newline in a field whose purpose is more than one
  line, which is worth knowing before writing a test that presses it.
- **Component defaults are shorthands, so the box editor needs a shorthand fallback.**
  `padding: 16` in a spec leaves all four longhands unset, and a box showing four empty
  fields on a node with obvious padding reads as broken. Each edge falls back to the
  shorthand for its placeholder; typing an edge still wins, because `setNodeStyles`
  appends it after the shorthand already in the bucket.

#### The canvas as an editing view

The two switchers are not just a write target — the canvas obeys them, and both
directions of that had to be closed.

- **`serializePageStyles` takes an `upTo` breakpoint.** Editing `base` on a 1024px
  artboard would otherwise show `lg` rules the panel is not displaying, and the field
  and the canvas would disagree about the same node. The cap only ever _narrows_: the
  media queries are still emitted, so a rule below the artboard's width stays dormant
  exactly as in the browser. The canvas can therefore show less than the real page at
  that width, never more. Preview and codegen pass no cap and get the whole stylesheet.
- **The breakpoint chips resize the artboard**, to that breakpoint's own `minWidth` —
  the narrowest width at which its rules apply is exactly the width that proves they
  do. A responsive rule that cannot be seen at a width where it applies cannot be
  judged, which is what the phase's done-when asks for. `ARTBOARD_SIZE.width` is now a
  default rather than a constant, and `fitTo` is passed the current size; Phase 9's
  device presets are a second control over the same number.
- **`serializeStatePreview` forces the selected node's pseudo-state on.** The canvas
  swallows pointer events to keep the design inert, so a `:hover` rule can never fire
  there and the state switcher would otherwise let someone author styles they cannot
  see. The rule doubles the node's class to outrank its own on specificity rather than
  using `!important`, which would also beat the real `:hover` once the preview was
  switched off. It is editor chrome: generated outside `serializePageStyles`, so
  neither the preview nor the export can inherit it.

### Phase 8 — Persistence, undo/redo, history ✅ done

A document loads from the API, autosaves on a debounce, keeps a coalesced undo stack,
and carries a version history with named versions and restore. The `version` column and
the `ProjectRevision` table were already in place from Phase 1, so no migration.

**Done when:** 200 edits undo/redo cleanly, a hard refresh loses nothing, and two tabs
editing the same project produce a detected conflict rather than silent loss. — met.

**Verified** by driving a real browser (Playwright), 30 assertions: a project with no
saved document seeds a starter page and writes it; a nested layout survives a hard
refresh; undo/redo by button, ⌘Z, ⌘⇧Z and Ctrl+Y; 200 inspector commits across four
fields produce 200 undo steps that walk all the way back to the loaded document and all
the way forward again, values exact; the history panel lists versions and marks the live
one; a named version is saved and restored; and two tabs produce the conflict dialog,
which resolves without writing the adopted document straight back. Typecheck, lint, 260
tests and the production build all pass; no console errors beyond the expected
cold-start 401.

#### Two deliberate departures from the plan above

Both were forced by a decision Phase 3 had already made — that `schema/ops` is pure and
returns a new `Page` — and both are cheaper than what was planned, not a shortcut around
it.

- **The history is a stack of documents, not of patches.** Immer's `produceWithPatches`
  buys a smaller history and costs an inverse-patch path for every mutation plus a class
  of bug — a wrong inverse — that snapshots cannot have. Because every op shares every
  node it did not touch, a snapshot is one object per changed node and an undo is an
  assignment. `state/history.ts` is generic over the value and has no React in it, which
  is what makes 200 steps a unit test rather than a browser one.
- **A save sends the whole document, not a JSON Patch.** There is no patch lying around
  to send, so producing one would mean diffing two snapshots on every autosave purely to
  make the request smaller. A page is tens of kilobytes; `baseVersion` is what makes a
  save safe, not its size.

A third follows from the first: **a conflict is a choice, not a rebase.** With two whole
documents and no record of which fields each side touched, a merge would have to guess,
and a guess that silently drops half of someone's styling is worse than any dialog. The
studio fetches the other side, stops autosaving, and offers "keep mine" or "discard
mine" with both documents intact — and because a restore is a forward write, nothing
either button does is unrecoverable.

Notes from doing it, so they are not rediscovered later:

- **The head revision _is_ the document.** `Project.currentRevisionId` points at it, and
  an autosave inside the throttle window updates that row in place rather than adding
  one. Without that, a twenty-minute styling session leaves several hundred rows nobody
  will ever open and buries the few worth finding. A revision is broken out when it is
  older than `REVISION_INTERVAL_MS`, when it is labelled (a bookmark a later autosave
  must never overwrite), when **a published link points at it** (added in Phase 9 — the
  general rule is that a revision anything else points at is immutable), or **when the
  author changed** — that last one is easy to miss and means two people's work is never
  merged into one history entry.
- **The optimistic lock is a conditional `updateMany`, not a read-then-write.** Two
  saves racing on the same base version both pass a read; only one can match
  `where: { id, version: baseVersion }`. It runs first inside the transaction that
  writes the revision, so a failure afterwards cannot leave a version pointing at the
  old document.
- **A failed save must not re-arm the debounce.** The document is still dirty after a
  rejection, so the autosave effect fires again, and against an unreachable server that
  is a request per second forever. `failedDoc` records what was refused; editing
  anything produces a new document and retries on its own, which is the right trigger.
- **The selection is derived, not corrected.** An undo can remove the node the inspector
  is pointed at. Fixing that in an effect leaves one render in which the panel is
  pointed at a node that is not there; treating a stored id that no longer names a node
  as "nothing selected" has no such render — and it reselects the node when a redo
  brings it back, for free.
- **React's compiler lint rules forbid reading or writing a ref during a render**, which
  the obvious shape of an autosave hook does twice (`docRef.current = doc`, and reading
  the saved baseline to answer "is anything unsaved?"). Both became state: the baseline
  changes once per save, not once per edit, so it costs nothing to keep there — and
  `unsaved` then falls out as a derived value that the indicator and the unload guard
  can share. The same rules are why the load and the editing state are two components:
  a `useMemo` that returns `null` until the document arrives cannot be branched on once
  ref-holding callbacks are inside it.
- **The studio is keyed on the project id.** Every piece of state below — the document,
  the history, the save baseline, the viewport — is about _that_ project, and resetting
  each of them by hand when the prop changes is a list that would be incomplete the
  first time one was added.
- **`role` moved onto `ProjectSummary`.** The editor has to know whether it is read-only
  before it renders, and deriving that from the workspace list meant either a flash of
  editable chrome or a spinner in front of a document that had already loaded.
- **`migrateDoc` runs on every read**, on the server, before anything else sees the
  document — the §13 mitigation, built now because the first time it is needed is the
  one time it cannot be added retroactively. It refuses a document from a newer build
  rather than guessing at a downgrade.

### Phase 9 — Preview (requirement #6) ✅ done

`/preview/:projectId/:pageId` rendering the runtime with `editing=false`, device-size
presets, and a shareable link (public-read via `Publish` slug at `/s/:slug`). The
`Publish` table was already in place from Phase 1, so no migration.

**Done when:** preview is interactive, has zero studio DOM in it, and the shared link
opens for a logged-out user. — met.

**Verified** by driving a real browser (Playwright), 34 assertions: the editor's Preview
button flushes the autosave and lands on `/preview/:projectId/:pageId`; the design renders
there with no palette, layers, inspector or canvas iframe on the page and no `data-ub-id`
or `data-ub-empty` inside it; an input that is inert on the canvas is typed into and is not
`readOnly`; Mobile and Tablet give the design a 375px and a 768px **viewport** — the frame's
own `window.innerWidth`, with `matchMedia('(min-width: 768px)')` true and `1024px` false
inside it, which a transformed wrapper could not do; publishing produces
`/s/preview-demo-<token>`; a second browser context with no cookies opens that link without
being sent to sign in, renders the design, has no chrome at all (zero buttons on the page),
and is titled with the project name; a component added afterwards does **not** appear on the
shared link until "Update link" is pressed, which keeps the same URL; unpublishing makes the
link explain itself rather than error. 267 tests (7 new), typecheck, lint and the production
build all pass; the only console error in the run is the 404 the deliberately-killed link is
supposed to produce.

#### A publish is a snapshot, and that changed Phase 8

The `Publish` row points at a `ProjectRevision`, not at the project, so what a link shows is
fixed when the button is pressed. That is the only behaviour that makes a link safe to send
— otherwise a reviewer opens whatever half-finished state the author is in right now — and
it is why the share dialog says so, and says explicitly when the link has fallen behind.

It also broke, quietly, on the first test that looked: **Phase 8's autosave updates the head
revision in place** inside the throttle window, and the head revision is exactly what a
publish points at. The snapshot was being rewritten underneath the link. The fix is one more
clause in `startNewRevision` — a revision that anything else points at is immutable, the
same rule that already froze a labelled one — so a save after a publish always starts a new
row. Phase 8's `REVISION_INTERVAL_MS` note is still true; it just needed the exception.

Notes from doing it, so they are not rediscovered later:

- **A preview is a viewport, not a scale.** The obvious device preset is a width on a
  wrapper, and it is wrong: `@media (min-width: 768px)` would still read the browser
  window, so a "phone" preview would quietly show the desktop layout — the exact thing
  someone opened it to check. The preset sizes the iframe, so the design's own media
  queries resolve against it. That is also why the preview is still an iframe at all;
  overlay alignment, D2's other reason, does not apply here.
- **The preview reads the API, not the studio.** It is a view of what is _saved_, because
  that is what a shared link and (Phase 10) an export are built from — a preview of
  unsaved memory would be a fourth thing that could disagree with the other three. The
  cost is that the Preview button must flush the autosave first, which it does, and that
  the document query runs at `staleTime: 0`, since arriving here always follows a save.
- **Same tab, not a new one.** Every piece of studio state is per-mount either way, so a
  new tab would not preserve the undo stack — it would only add a second editor holding a
  document the first one keeps changing.
- **The slug is a capability, so it carries a token.** `landing-page` is guessable and the
  endpoint needs no credential beyond it; `landing-page-k3f9d2q7` is not. The readable
  prefix is what keeps a link recognisable to the person who sent it. For the same reason
  an unknown slug and an unpublished one are the same 404 — distinguishing them would make
  the endpoint an oracle for which links used to exist.
- **`/published/:slug` sits in the outer Fastify scope and the project routes in an
  encapsulated child**, which is what makes "public" structural: a `preHandler` added
  inside a child plugin cannot reach back out, so the public route cannot acquire an auth
  hook by someone moving a line.
- **The client asks for the shared page `anonymous`.** Not an optimisation — a signed-in
  visitor's session is irrelevant to what a link returns, and sending a bearer token would
  make the two cases different code paths for no reason.
- The stale check is `published.version < currentVersion` rather than `!==`, because a
  restore moves the project forward too. The published revision is never _ahead_.

### Phase 10 — Code export (requirement #7) ✅ done

`packages/codegen`: the JSX IR and its printer, per-spec `emit` templates, the page and
project emitters, a zip writer, and `projectArchive` — the one function both delivery
paths call. `GET /api/projects/:projectId/export` streams it; the studio's **Code** button
opens a read-only viewer over the same files and downloads the same archive.

**Verified** against the acceptance criterion, end to end: a project built in the studio,
downloaded through the browser's own download, extracted with Windows' unzip, then
`npm install && npm run build` — `tsc --noEmit` and the Vite build both clean, first try.
Separately, the `demoDoc` fixture (which hits every template branch) was emitted, built,
and screenshot-diffed against the runtime. Typecheck, lint, 316 tests and the production
build all pass.

**Fidelity (D6), measured rather than asserted.** The oracle is `PageRenderer`
server-rendered into the export's own document shell, so the only difference between the
two pages is which code wrote the markup and the stylesheet; both were screenshotted at
1024×768 and diffed pixel by pixel inside the browser. The DOM matched tag for tag. Of
786,432 pixels, **46 differed — a single `ub-typing-dot`**, caught at a different point in
its CSS animation (the count moves run to run, which is how you know). The only structural
difference is the fixture's node whose component the library no longer has: the runtime
draws a red box so it stays selectable, the export omits it and says so.

Notes from doing it, so they are not rediscovered later:

- **Prettier is not a dependency, and neither is a zip library.** Both would have been a
  version to drift between the studio's in-browser generation and the API's route. `ir.ts`
  formats its own output and `zip.ts` writes its own archive (stored, not deflated — an
  export is a dozen small text files, and compression is the only part of a zip writer
  that is hard to get right). `generateProject` stays synchronous and pure, which is what
  lets a snapshot test assert the exact bytes a user receives.
- **A zip's central directory records its own size, and `at` has already moved by the time
  you write it.** Computing it inline put the first twelve bytes of the end-of-central-
  directory record inside the directory's own length. Every archive still opened in a
  forward-parsing test and would have failed in every real tool. The test reads back the
  way an unzip program does — from the end, through the directory, following its offsets
  into the local headers — which is what caught it.
- **A reader written next to its writer agrees with it by construction.** The unit tests
  prove the archive is self-consistent; `Expand-Archive` (which is .NET's
  `System.IO.Compression`, and validates CRCs) extracting all fourteen files to
  byte-identical SHA-256 hashes is what proves it is a zip.
- **Typechecking the API meant parsing the component library's `.tsx`.** `codegen` read a
  component's `emit` template off the same spec object that carried its React
  implementation, so `apps/api/tsconfig.json` needed `jsx` and the DOM lib — which handed
  server code a `document` that `tsc` would accept, and put React and lucide in the API
  bundle (296 KB). Both are fixed by the spec/implementation split below.
- **The studio downloads what is on screen, not what the server holds.** Unlike preview and
  a shared link, the code panel reads the live document — a panel that lagged a second
  behind the canvas would answer a question nobody asked. It is also forced: the access
  token is in memory only (D-auth), so a plain `<a href>` to the export route could not
  carry it, and fetching-then-blobbing would be a round trip to get bytes the browser can
  already produce. The API route exists for programmatic and CI use.
- **`expand.ts` kept its own `asString`/`asBoolean`/`asEnum`**, character-identical to the
  ones `@ui-builder/components` exports and `codegen` already imported from. Deleted in
  the split below; the "coercions match the runtime" tests now guard a gap that cannot
  open, which is what they should have been doing all along.

**Reproducing the fidelity diff** (the harness is not in the repo — Playwright is not a
dependency, it lives in the npx cache): emit the fixture with
`npx tsx packages/codegen/scripts/emit.mts <dir>`, `npm i && npm run build` it, serve with
`vite preview`; render the oracle by calling `renderToStaticMarkup(PageRenderer({ page,
theme }))` from a script under `packages/runtime` (its tsconfig has `jsx: react-jsx`; tsx
compiles some workspace `.tsx` with the classic runtime regardless, so set
`globalThis.React`) into the same `<div id="root">` shell; then screenshot both and diff
them by drawing the two PNGs onto a canvas in the browser, which already decodes them.

### Spec/implementation split ✅ done

`@ui-builder/components` now has two entry points. `.` is data — the 27 specs, the
registry, `emit.ts`, `css.ts`, `markdown.ts` and the coercions — with no React, no lucide
and no DOM anywhere it reaches. `./react` is the implementations and the palette's icons,
joined back to a spec by `key`. A spec names its component and its icon; it no longer
holds either.

This was the Phase 10 note's "obvious Phase 12 cleanup", taken early because it is what
Phase 11's evaluator should be built against: the expression evaluator has to run in the
iframe and nowhere else (§13), and a package where the data half cannot reach React is a
much better place to enforce that than one where every import drags a renderer along.

**Measured:** the API bundle went from 296 KB to 212 KB, and its source map now lists zero
React or lucide modules — it carries the 25 spec files, `css.ts`, `markdown.ts` and the
registry, which is exactly what `codegen` reads. `apps/api/tsconfig.json` is a plain Node
config again: no `jsx`, no DOM lib, so `tsc` is once more the first thing that would reject
a browser global in a request handler. `no-restricted-globals` stays as the backstop.

**Verified** by driving a real browser (Playwright), 9 assertions: every palette row draws
its own icon and none fell back to the generic square; a dragged Vertical Stack lands; then
every component in the library is click-inserted and each renders as the element its own
`codegen.tag` claims — the oracle is read out of the registry, so a component added later
is covered without touching the script; nothing renders as the unknown-component box; and
the Code panel emits the markup the canvas rendered. Typecheck, lint, 432 tests and the
production build all pass. The codegen snapshot is byte-identical, which is the real proof
that nothing about the export moved.

Notes from doing it, so they are not rediscovered later:

- **Only a module boundary separates a bundle.** Every field of a spec that _held_ a React
  value — `component`, `icon` — had to leave the file the spec lives in, not merely change
  type, because ESM pulls in whatever the module imports. That is why it is 25 spec files
  and 26 component files rather than one edit to `ComponentSpec`.
- **The joins are by string now, and TypeScript will not check one of them.** React 19's
  `JSX.ElementType` includes bare `string`, so `<Icon />` where `Icon` is the name
  `'Square'` compiles clean and fails only at runtime, as a console warning and a missing
  element. It happened — the layers tree still read `spec?.icon` — and the browser pass is
  what caught it. `implementations.test.ts` asserts both directions of the join instead:
  every spec has a component and an icon, and neither table carries anything the registry
  does not list.
- **The React compiler lint decides where a lookup may live.** `ICONS[spec.icon]` is fine
  in the palette, where `spec` is a prop, and an error in the layers tree, where `spec`
  came from `getSpec(node.type)` — the compiler cannot tell a component derived through a
  call from one rebuilt every render. `ICON_BY_KEY` is built once at module scope for that
  reason, and both surfaces index it; it is not an optimisation.
- **The shared option lists had to move with the data.** `SIZES`, `VARIANTS`, `GAP_STEPS`
  and the rest are read by the emit template _and_ the component's `asEnum` call, so they
  live in the spec file and the component imports them. `GAP_STEPS` was declared twice —
  `Stack` and `Grid` — and is now `specs/steps.ts`, which is the same class of bug the
  coercion copies were.
- `parseOptions` and `initialsOf` were duplicated between the components and `expand.ts`
  for the same reason the coercions were, and moved to `derive.ts` alongside them: the
  derivations a prop goes through on its way to a screen are exactly the ones D6 says the
  canvas and the export must agree on.

### Multi-select ✅ done

The last open piece of Phase 4. The selection is an ordered array rather than one id, with
the _primary_ — the one added last — answering every question that still has a single
answer: which node's values the inspector's fields show, whose pseudo-state the canvas
forces, which row the tree names in `aria-activedescendant`, where a Shift-range starts.

Four ways to make one. Ctrl/⌘-click anywhere adds or removes one. Shift-click in the layers
tree takes the run between the primary and the clicked row, and Shift+arrow grows it and
shrinks it again. Ctrl/⌘+A takes every layer on the page. And a band: drag on the page
background, or with a modifier anywhere, and the shallowest nodes it touches are selected —
live, so the outlines follow the band rather than appearing when you let go.

What it can then do: every Design field writes to all of them; Delete and ⌘D act on the
whole selection; and dragging one member carries the rest, landing them contiguous and in
document order.

**Verified** by driving a real browser (Playwright), 22 assertions covering this, the rail
and `SideNav` together — including that one Design edit reaches both selected nodes and
leaves the third alone, that a field the selection disagrees on shows `Mixed` and holds no
value, that a band takes the stack and not also its three children, and that dragging a
pair reorders both, in order, in one step. Typecheck, lint, 457 tests and the production
build pass; the codegen snapshot is unchanged.

Notes from doing it:

- **A selection is a set; a document is a tree.** Every whole-selection command needs
  `topmostNodes` first, or deleting a stack and something inside it deletes the stack and
  then throws looking for a node that went with it. It is in `schema/ops.ts` rather than in
  the studio because it is a fact about documents, and because it is far easier to test
  there. `moveNodes` is there for the same reason: the index arithmetic that keeps a
  dragged selection contiguous is the part that would be wrong.
- **A press must not commit to what it means.** Pressing something already in a
  multi-selection has to _leave the selection alone_, or the drag that follows carries one
  node. Narrowing back to one is then the job of `onClick` — the callback the drag session
  already had for the palette, which fires only when the gesture never passed the movement
  threshold. The same deferral is what lets a press on the page background be either "select
  the page" or "start a band".
- **"What does a panel show for a mixed selection?" turned out to be one function.**
  `useStyleField` was already the single place a control's value comes from, so reading
  across the selection instead of from one node was contained — and a field that shows
  `Mixed` and stays empty is the honest answer, because a box holding one member's value
  invites a keystroke that would quietly flatten the others.
- **The band takes the shallowest node it touches and stops.** Returning everything it
  overlaps would hand back a card _and_ its heading _and_ its text, so the first thing
  anyone did with the new selection would be to fight it. Stopping there is also what makes
  the result already-topmost.
- Its rects are re-measured on every pointer move rather than cached at the start. A pan or
  a zoom mid-band moves every element, and a stale rect selects what _used_ to be there.

### The left rail ✅ done

The left panel showed Pages, the palette and the layers tree stacked, split by two
draggable separators. Three cramped panels read worse than one useful one, and every
project spent its first minutes with the palette cut off mid-category. A 44px icon rail now
switches between them and the chosen view gets the whole column; pressing the open one
collapses the panel entirely, which is the fastest way to give the canvas the width back.

- The inactive views stay **mounted and hidden**, so switching back finds the palette
  scrolled where it was left and the tree collapsed the way it was arranged. That costs one
  thing worth knowing: a hidden tree still has a drop resolver registered, and its bounds
  collapse to a zero rect at the origin — which would have claimed a drop at exactly
  (0, 0). `resolveLayerDrop` now declines a tree with no area at all.
- `.section` sets `display: flex`, which outranks the browser's own rule for the `hidden`
  attribute. A CSS-module `[hidden]` rule is what actually hides them.

### Phase 11 — Interactions, state & data (requirement #8) ✅ done

State variables panel, Queries panel, event→action editor, expression fields with
autocomplete over scope, `repeat`, conditional visibility, error badges.
Codegen for `useState` / fetch hooks / handlers.
**Done when:** a page with a counter button, a text input bound to state, and a list
rendered from a real API works identically in canvas, preview and exported code.

#### The schema layer ✅ done

The contract first, before the panel, the canvas or the emitter — §15's reasoning was
that all three read it and building any one of them first means designing it against a
guess.

Shipped: `StateVar`, `QueryDef`, `ActionStep`, `RepeatSpec` and `Node.showIf` in
`doc.ts` with their zod schemas; `Page.state` and `Page.queries`; `events` typed as
`ActionStep[]` where it was `unknown[]`; **`DOC_SCHEMA_VERSION` 1 → 2** with the
migration that fills in the two new collections; `expr.ts`; and the operations the
panels will commit through — `setNodeEvent`, `setNodeRepeat`, `setNodeShowIf`,
`create/add/update/removeStateVar` and the same five for queries. Typecheck, lint, 540
tests (45 new) and the production build all pass; the codegen snapshot is unchanged.

Notes from doing it, so they are not rediscovered later:

- **The package that defines evaluation is the package that cannot evaluate.** §13's
  mitigation is that user code runs only inside the canvas iframe, and `schema` is
  imported by the studio, the API and the generator. So `expr.ts` has no `new Function`
  in it and never will: `evaluateTemplate(source, evaluate)` takes the evaluator as an
  argument, which makes "only one realm can run this" a fact about the module graph
  rather than a convention someone can forget. The spec/implementation split was the
  groundwork; this is the part it was groundwork for.
- **Nothing rewrites expression text, so the text is portable.** The alternative — state
  named `count` emitting `const [count, setCount] = useState()`, and every `state.count`
  in a template rewritten to `count` — needs a source transform that is reliable enough
  to edit user code, which a regex is not and a parser would be a dependency. Emitting
  one `state` object instead means the canvas and the export evaluate _the same string_,
  and D6 holds for bindings the way it already holds for CSS. It is also why the
  reference scan can stay a conservative regex: it feeds usage lists and rename warnings,
  and nothing depends on it being exact.
- **A hole standing alone has to keep its type.** Concatenating segments is right for
  `Hi {{ state.name }}` and wrong for `{{ state.busy }}` on `disabled`, where the string
  `"false"` is truthy and would disable every button whose expression said not to. The
  rule lives in `evaluateTemplate` so the canvas, the preview and the export cannot each
  decide it differently.
- **The stored form is what was typed.** `code` is template source rather than a compiled
  JavaScript expression, so a mixed field round-trips back into the inspector by parsing
  rather than by decompiling a template literal — which is the version of this that has
  to get escaping right in both directions and eventually will not.
- **`parseTemplate` is total.** An unterminated `{{` is text. A field is re-parsed on
  every keystroke to decide what to show, and half a typed expression must not blank the
  canvas. Its naivety is the price: the first `}}` closes a hole, quotes and all, and
  there is a test asserting exactly that so the limit is a decision with a name on it.
- **Deleting a variable takes the steps that targeted it.** `deleteNode`'s cascade,
  applied to bindings: a `setState` pointing at a variable that is gone is a handler that
  silently does nothing, and every reader would have to tolerate the dangling id.
  Expressions that _named_ it are deliberately left alone — see the id-vs-name note in
  §10 — which is what `stateVarUsage` exists to warn about first.
- **A migration's job is to keep a project openable, not to be strict.** `ProjectDocSchema`
  runs after every migration, so a single malformed event step would fail a whole
  document. The 1→2 migration filters them instead. Nothing can have written one — there
  was no editor — but that is exactly the kind of certainty that turns out to be wrong
  once.
- **`state` and `queries` are required, not optional.** Optional would have made the
  migration a no-op and left every reader writing `?? []` forever, which is the
  half-valid shape `migrateDoc` exists to prevent. The cost was twelve construction sites
  across five packages; `makePage` was added alongside `makeNode` so the next field is one
  edit rather than another sweep.
- **A duplicated page keeps its state and query ids.** Node ids must be freshened because
  they become CSS class names; these are looked up only within their own page, and keeping
  them is what lets the copied subtree's action steps go on resolving without every
  `stateId` in it being rewritten.

#### The runtime ✅ done

`packages/runtime` now holds the evaluator, the action interpreter, page state, queries
and the per-node error boundary — the one `new Function` in the repository, and the other
half of §13's expression mitigation. `PageRenderer` evaluates bindings, `repeat` and
`showIf` identically whether editing or not, and attaches handlers only when not: on the
canvas a click selects a node, and running the author's `onClick` would fight the editor
for the same gesture.

It had no tests when the panels were started — `packages/runtime` was not even a vitest
project — so it is one now, with 64 covering the four modules that were deliberately
written to be testable without React: `createEvaluator`/`runStatements`, `runSteps`,
`stateReducer`/`resolveStateValues`, and `buildRequest`/`cyclicQueries`. They pass as
written, which is the useful outcome: the layer the panels are built on is checked rather
than assumed.

#### The panels ✅ done

- **A Data view in the left rail** (`studio/data/`), not an inspector tab: state and
  queries belong to the _page_, and a panel that emptied itself when the canvas was
  clicked would be unusable for what it is for — writing a variable, then binding it.
  Variables carry a name, a type, an initial value and a usage line; queries carry a
  method, a template URL, headers, a body and `runOnLoad`, and one that reads its own
  result says so and cannot be set to auto-run — the same `cyclicQueries` the runtime
  uses, so the panel and the canvas cannot disagree about which query is refusing to run.
- **An Interactions tab** generated from `ComponentSpec.events` (D7), with the step list
  editor — add, reorder, remove, and a per-kind body — plus `repeat` and `showIf` under
  Rendering. It writes to the _primary_ selection only: an action list is a sequence
  authored for one thing.
- **Expression fields with completion over scope** (`studio/expressions/`). One control,
  no mode: text with a `{{ }}` in it is an expression and text without one is a literal,
  which is the rule §10 settled on when it dropped the separate `Expr` type. Completion
  offers the page's own variables and queries first, and only inside a hole.
- **Every prop is bindable.** A `{ }` toggle on each Props row switches it between its
  own control and an expression field, so `disabled` can read `{{ state.busy }}` and a
  label can read state — which is what "a text bound to state" in the acceptance
  criterion needs.

Two things worth keeping, both found by driving the real app rather than by reading it:

- **A `<label>` must wrap the control and nothing else.** Wrapping the field _and_ its
  hint made the input's accessible name the whole paragraph — `"ToThis expression is
missing its closing }}."` — which a screen reader would read out in full. The label
  names the control with `htmlFor`; the hint and the validation line are siblings.
- **An inspector tab has to be keyed by node id.** A field holds a draft committed on
  blur, and two components can declare a prop of the same name — `text` is both a Text's
  body and a Button's label. Without the key React reuses the field across a selection
  change and the draft typed for one node commits onto the next one selected, which is
  how a Button ended up rendering the Text's binding. It is a data-corrupting bug that no
  unit test in this repo would have caught, and the fix is one `key`.

#### Codegen ✅ done

The last piece, and the one the phase's acceptance criterion is about. State becomes
`useState`, each query a `useQuery` call whose request interpolates the page, an action
list a named handler, `repeat` a `.map()` and `showIf` a `&&`. The emit vocabulary did not
change, as §15 predicted: every `EmitValue` and `EmitCondition` now resolves _or_ writes
the coercion it would have performed, and `values.ts` is the only place that fork is made.

**Verified** three ways, because a generator has three different ways to be wrong. The
snapshot says what a page becomes — a second fixture (`interactiveDoc`) beside the static
one, whose own snapshot is unchanged, which is the proof that a document with no
interactions still exports byte-for-byte as before. `npm install && npm run build` inside
the emitted project says it compiles, which is what caught two things nothing else would
have. And a real browser driving the _built export_ against a mocked API says it works: 12
assertions — the counter increments, the toast shows what it computed, the awaited request
carries its body, a bound boolean disables a field, a bound enum picks the other variant,
typing re-sends the query and the list follows, and a button inside the repeat navigates
with its own item. Typecheck, lint, 695 tests and the production build all pass.

Notes from doing it, so they are not rediscovered later:

- **The export needed a runtime, and it is four small files rather than a wider hatch.**
  Phase 10's rule was that an export is markup, with `EmitModule` as the one exception for
  a component whose behaviour cannot be a static tree. A page with state and requests meets
  that rule the same way instead of loosening it: what is generated _per page_ is readable
  code naming the author's own variables, and what is identical in every project — how a
  value becomes text, how a request becomes a result, where a toast goes, what a path
  means — is shipped whole in `src/lib/`, as `css.ts` and `SortableRows` already were. Each
  file only lands in a project that reaches for it, so a document with no bindings still
  exports as markup and nothing else.
- **The coercions are written twice and checked by running both.** `src/lib/values.ts` is
  the export's copy of `stringifyValue`, `isTruthy`, `asEnum` and `initialsOf`, and it has
  to be a copy — it ships to a stranger and cannot import this repo. `values.test.ts` runs
  the two over the same table of awkward values, which is how the one real divergence was
  found: `Number(null)` is `0`, so a bound number prop reading a field that had not loaded
  yet exported as zero where the canvas showed the fallback.
- **`cyclicQueries` moved to `schema`.** Three things have to agree about which query
  refuses to run on its own — the Data panel, the canvas and the generator — and codegen
  cannot import `@ui-builder/runtime` (§2). An exported project that looped where the canvas
  did not would be the worst of the three places to find out.
- **Nothing rewrites the author's expression text, so the generated component defines the
  names around it.** One `state` object rather than a variable per name, and `queries` as an
  object of hooks, because `state.count` has to mean the same thing on the canvas and in the
  export. The alternative — rewriting `state.count` to `count` — is a source transform
  reliable enough to edit user code, which a regex is not.
- **The generated project's own `tsc` is a test, and it fails on things a snapshot cannot
  see.** `noUnusedLocals` means a page that declares a setter nobody calls does not build,
  which is why the state declaration uses array elision (`const [, setState]`) and why a
  handler's `event` parameter is emitted only when a step actually reads one — a scan that
  strips string literals first, so `showToast 'saved the event'` does not count.
  `noUnusedParameters` is the same rule from the other side. And `list()` returns `any[]`
  rather than `unknown[]`: rows come out of a request whose shape nothing knows, and
  `item.name` under `strict` is an error the author cannot fix from the builder.
- **A handler inside a `repeat` cannot be hoisted past it.** It closes over the `item` its
  copy was rendered for, which is how "open this one" knows which one. So the `.map()`
  callback grows a block body and the handler is declared inside it, and the IR carries the
  statements rather than the walker assembling strings — the reason §11 built an IR at all.
- **A toggle reads from the update, not from the render.** `setState((current) => …)` with
  `!truthy(current.flag)`, so two toggles in one handler are two flips. Through the render's
  `state` they would be one, which is the reducer's rule in the runtime kept by the updater
  form. Everything _else_ in a handler deliberately reads the render's `state`: steps see the
  scope as it was when the event fired, in the export exactly as on the canvas.
- **The named transforms are the one thing a binding cannot reach**, and the export says so.
  `options`, `radios`, `navItems`, `markdown`, `tableHead` and `tableRows` exist because the
  _shape_ of what they emit is the text they parse, which a static template cannot describe.
  Making them dynamic means shipping their parser and writing their markup a second time —
  for `RichText` that is the Markdown parser §7 says an export never carries. So a bound
  source prop expands as if the field were empty and adds a warning naming the node and the
  prop, the same bargain `walkNode` already strikes with a component the library no longer
  has. A bound element _name_ (a `Heading` whose level is an expression) is the other one:
  `<Tag />` is legal React but needs a capitalised binding in scope, so it exports as the
  fallback and says so.
- **`text()` around a template literal is noise, and brackets around an expression are too.**
  Both were in the first output and both are gone: a template literal is already a string and
  never null, and a hole only needs brackets when it contains a top-level comma the enclosing
  syntax would claim. The scanner that decides the second is bracket- and quote-aware, which
  is a scanner rather than a parser for `parseTemplate`'s reason — it has to be total.
- **An `Input` has no `value` prop, so a field is uncontrolled in the preview and the export
  alike.** That is `valueBinding`'s existing decision — a stored value is where a field
  _starts_ — and it is why the acceptance criterion's "input bound to state" is the field
  _writing_ the variable while something else displays it. Worth knowing before wondering
  why a bound `value` does not appear in the output: it is not a prop the inspector offers.

### Phase 12 — Scale-up ◑ in progress

Reusable user components (symbols) with props, image/asset upload (S3-compatible),
copy/paste + duplicate + keyboard shortcut map, component variants, publish/hosting,
Yjs multiplayer, team roles UI. Its members are independent of each other rather than a
sequence, so they are taken in the order they are worth most.

#### Reusable user components ✅ done

A component the document owns, with a prop surface, placed on any page or inside another
component and edited in one place. `props` in the render scope has been empty and waiting
since §10; this is what fills it.

**The document model.** `ProjectDoc.symbols: SymbolDef[]` — document-scoped rather than
page-scoped, because a component used on one page is a subtree and the thing worth building
is the card that appears on four. A `SymbolDef` is a node tree with a name, a description
and `SymbolProp[]`. An instance is a `Node` whose `type` is `symbol:<id>`: a namespaced
registry key rather than a second field, so `getSpec` misses the whole namespace by
construction and the branch is one `symbolIdOf` call at each of the four places that need
one. **`DOC_SCHEMA_VERSION` 2 → 3** with the migration that fills in the collection.

**`NodeTree`** is the piece that made it cheap. `Page` and `SymbolDef` both satisfy
`{ rootId, nodes }`, so every tree operation in `ops.ts` became generic over it and returns
the type it was given. There is one `moveNode`, not two — and the studio's canvas, layers
tree, drag controller and inspector edit a symbol through the code paths they already had.

**`symbolSpec`** is the other half: a symbol becomes an ordinary `ComponentSpec` (D7), so
the palette lists it, search finds it, `createNodeFor` bakes its defaults into a new
instance and the Props tab generates its fields. `specFor(type, symbols)` is the one lookup
every subsystem holding a `Node` makes, and it is bound to the open document in the studio
so no panel can forget to pass the symbols and silently draw every instance as unknown.

**No wrapper element.** An instance _is_ the element its symbol's root renders, wearing one
extra class — its own, so the Design tab styles one placement. A wrapper would be a box in
the middle of someone's flex row that exists only because the builder needed somewhere to
hang an id, and it would have to exist in the export too. The generated component takes the
same class as a `className` prop for exactly this reason, and `cx()` in `src/lib/values.ts`
is the one small helper that joins it.

**Codegen** writes one `src/components/<Name>.tsx` (plus its CSS module) per symbol, beside
the `EmitModule` files that already lived there, and a page emits
`<ProductCard className={styles['ub-n-…']} title="Aurora" />`. An exported project that used
a card four times contains one `Card`, not four copies — otherwise the export would be a
worse codebase than the document it came from. `walk.ts` was split out of `page.ts` so a
page and a symbol share one walk and differ only in what they declare above the return.

**Verified three ways**, as Phase 11's codegen was. The snapshot says what a symbol becomes
(`symbolDoc`, a second component placed inside the first, props of every shape, an instance
styled at its placement, and a component rendered once per row of a request); `demoDoc`'s
own snapshot is unchanged, which is the proof the phase is additive. `npm install && npm run
build` inside the emitted project says it compiles under `strict`, `noUnusedLocals` and
`noUnusedParameters`. And a real browser driving the studio says it works: 15 assertions —
a component is created and opens on the canvas, is built with the same palette a page is,
the palette refuses to offer it to itself, a node inside it reads `props`, two placements
render with no wrapper, one placement's props and styles change without the other
following, an edit to the component moves both at once while each keeps its own props, and
the export writes the component file. Typecheck, lint, 746 tests and the production build
all pass; no console errors beyond the expected cold-start 401.

Notes from doing it, so they are not rediscovered later:

- **An instance's props are keyed by name, and that is the opposite of `ActionStep`'s
  choice.** A step holds a `stateId` because a rename cannot be propagated into free-form
  expression text; an instance's props are a structured record, so `renameSymbolProp` moves
  the key on every instance in the document and that is exact. Keying by name is also what
  lets a symbol be a `ComponentSpec` at all — the alternative is the inspector, the renderer
  and the generator each learning a second way to read a prop. Expressions _inside_ the
  symbol that name the old prop are still left alone, for §10's reason, which is what
  `symbolPropUsage` warns about first.
- **Editing a component has to render it against its own defaults.** Found by driving the
  app: every binding in the component drew its fallback, because the scope's `props` was the
  page's empty one. A component whose contents you cannot see is a component you cannot
  build, so `PageRenderer` takes a `props` seed and the studio passes `symbolDefaultProps`.
  It is also the honest value — it is what a placement that sets nothing would show.
- **The containment guard belongs in the palette, not the drop resolver.** "A component may
  not contain itself" is a fact about the whole surface rather than about a node, so the
  palette declines to offer such a component and the drag never starts. `canReceive` needed
  no change at all: an instance answers `acceptsChildren: false` whether or not the symbols
  are passed, which is the same answer an unresolvable type gets. `endDrag` keeps the check
  for the gap between a drag beginning and it landing.
- **A `.map()` with no statements was emitting one closing paren short.** Every earlier
  `repeat` fixture happened to declare a handler and take the other branch of `printJsx`, so
  the export that a repeat-without-handlers produced would not compile — and nothing noticed
  until a symbol fixture hit it. This is what the "build the emitted project" check is for;
  a snapshot would have happily pinned the broken output.
- **The rail's `components` view used to be the palette.** It is now the document's own
  components and the palette is `library`, labelled "Insert" — in a builder, "Components"
  means the ones you built. The remembered-view default moved with the meaning.
- **The studio hands every panel a _page view_ of whichever surface is open.** Thirty-six
  files read `state.page`; none of them care which kind it is, and teaching them all would
  have bought nothing. The distinction lives in `resolveSurface` and in the one seam that
  commits an edit, which keeps only the tree half of what a transform returns when the
  surface is a symbol. The Data view is swapped for the prop surface while one is open, so
  nothing can write to the state and queries that get dropped on the way back out.
- **A component sees its props and the theme, and not `state` or `queries`.** A component
  that read the page it happened to be dropped on would work on that page only. The
  generated component has neither name in scope either, so an expression reaching for one
  fails the same way in both (D6) — and the expression field's completion offers `props`
  inside a component and the page's data outside it, so the difference is visible before it
  is a mistake.
- **Deleting a component takes its instances with it**, `removeStateVar`'s cascade one level
  up, and the panel says how many first — a delete that quietly took three nodes is not an
  honest one. `symbolInstances` is what makes that count knowable before the fact.

---

## 13. Risk register

| Risk                                                              | Impact                     | Mitigation                                                                                                                              |
| ----------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| React across the iframe realm (events, portals, hydration quirks) | Blocks Phase 4             | Two independent roots + one shared store. Never portal across realms. Prototype this on day 1 of Phase 4 before building overlays.      |
| Zoom breaks overlay alignment                                     | Constant visual bugs       | Single `toStudioSpace()` helper; an overlay never reads a rect directly.                                                                |
| Canvas ≠ exported code                                            | Kills trust in the product | D6: one shared serializer + codegen snapshot tests + a canvas-vs-export screenshot diff.                                                |
| Doc schema churn breaking saved projects                          | Data loss                  | `schemaVersion` + a migration function run on every load; migrations are pure and tested against fixtures.                              |
| Undo/redo drift from server state                                 | Corrupted docs             | Undo operates on patches, autosave sends the same patches, server validates with the shared zod schema and rejects on version mismatch. |
| Expression evaluation footguns (infinite loops, XSS)              | Broken/unsafe canvas       | Evaluate only inside the iframe, wrap each node in an error boundary, no `eval` of user code in the studio realm.                       |
| Scope creep into "the whole of Plasmic"                           | Never ships                | Phase gates with explicit acceptance criteria; Phase 12 is the parking lot.                                                             |

---

## 14. Testing strategy

- **Unit (Vitest)** — `schema/ops` tree mutations, `schema/style` serialization,
  `schema/expr` evaluation, codegen emitters.
- **Snapshot** — `codegen` against fixture docs; a diff means the export changed.
- **Integration (Vitest + supertest)** — API auth, RBAC, project versioning/conflicts.
- **E2E (Playwright)** — the flows that unit tests cannot cover: drag from palette,
  reorder, zoom + select, undo/redo, preview, export-and-build.
- **Visual** — screenshot canvas vs. built export; fail on diff over threshold.

---

## 15. Immediate next step

~~**Phase 11 — interactions, state and data.**~~ Done, including codegen — see Phase 11
above. Every numbered requirement now has an implementation. A counter, a field that
writes a variable, and a list from a real API work on the canvas, in the preview, and in
the built export, which is the phase's acceptance criterion in full.

~~**Next is Phase 12**, starting with reusable user components.~~ Done — see Phase 12
above. A component is created, built with the same palette a page is, given props, placed
twice, configured and styled per placement, edited once so both follow, and exported as a
real React component that compiles.

**Next in Phase 12**, in the order they are worth most:

- **Slots.** A component whose props are all values can be configured but not filled, so
  the natural next piece is `acceptsChildren` on a symbol and a `Slot` node inside it. The
  document model does not have to move for it — an instance already has a `children` array
  that nothing reads — and codegen already knows how to pass children through, since every
  library container's emit template has a `slot`. What it needs is a decision about
  multiple slots, which is where the shape stops being obvious.
- **Create a component from a selection.** Today a component is built from scratch; the
  gesture that matters is selecting a card someone has already made and saying "this is a
  component". It is `copySymbol` in reverse plus a `deleteNode`/`insertNode` pair, and the
  only real question is what happens to the styles on the node that was selected.
- **Component variants**, which is the §12 line item that becomes tractable once slots
  exist: a variant is a prop whose value picks a subtree, and without slots there is not
  much subtree to pick.

Three smaller things are unblocked and worth taking whenever they suit:

- **The rest of the §7 component table**, which is additive: a spec file, a rule in
  `css.ts` and an `emit` template per component, with `css.test.ts`, `registry.test.ts`
  and codegen's "every component declares one" test already failing the build on the ways
  that can go wrong. `SideNav` is the worked example of the whole shape, including when a
  component needs a named `codegen` transform of its own. `Icon` is the one that still
  needs a decision rather than typing — the `icon` PropSpec type waits on settling the
  icon set, which is a bundle-size call. The compound components (`Tabs`, `Modal`,
  `Accordion`) still want insert-time subtree templates, which is the one piece of
  machinery this batch would add.
- **A bound source prop on a named transform**, which Phase 11's codegen deliberately left
  as a warning rather than an export (see its notes). `options`, `radios` and `navItems`
  are the tractable three: `parseOptions` is fifteen lines of pure data handling, so
  shipping it into `src/lib/` and emitting `parseOptions(text(…)).map(…)` around the markup
  the template already describes would keep D6 — provided the markup is still written once,
  which means the transform branches in `expand.ts` growing a second form rather than a
  second copy. `tableHead`/`tableRows` are the same shape and more of it. `markdown` is the
  one to leave alone: it means shipping the parser §7 says an export never carries, and
  "render Markdown that arrived from a query" is a different feature wearing the same prop.
- ~~**Multi-select.**~~ Done — see its section above Phase 11. Phase 4 is closed.
- ~~**Splitting the component specs from their React implementations.**~~ Done — see the
  section above Phase 11. The API's tsconfig is a plain Node one again and its bundle is
  212 KB with no React in it.

Two device-preset notes for whoever picks the studio side up: the presets live in
`apps/web/src/preview/devices.ts` as plain data, and the studio's own `artboardWidth` is
still driven by the breakpoint chips alone. Pointing a second control at that number is a
few lines, but it needs a decision about what the two controls mean together — a `md`
breakpoint chip and a "Tablet" preset both want to own the artboard's width — and that is
a question about the inspector, not about preview.
