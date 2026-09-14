# UI Builder — Technical Plan

A Plasmic-style visual UI builder: workspaces and projects, a drag-and-drop zoomable
canvas, a searchable component palette, a properties inspector, live preview and publish,
page state and data, and React code export.

**Stack:** React + TypeScript (Vite) · Node (Fastify) · PostgreSQL (Prisma)

This file is the architecture record, not a status report — what the system is and why it
is shaped that way. Its numbered decisions (D1–D15) and sections (§2, §7, §10, …) are
cited from source comments, so the numbering is stable and a citation is meant to be
followed. `README.md` says what the product does; `CLAUDE.md` is the working brief.

---

## 1. Decisions

These are the load-bearing choices. Each carries its rationale so it can be revisited
deliberately rather than by accident.

| #   | Decision                                                                                                                      | Why                                                                                                                                                                                                                                                                                                  | Cost to change                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| D1  | **npm workspaces monorepo**                                                                                                   | `schema` and `codegen` are imported by both web and api. No extra toolchain to introduce.                                                                                                                                                                                                            | Low                                       |
| D2  | **The canvas renders inside an `<iframe>`**                                                                                   | Total CSS isolation between studio chrome and the user's design, and accurate layout measurement. The same approach Plasmic, Webflow and Framer take.                                                                                                                                                | **Very high** — retrofitting is a rewrite |
| D3  | **Normalized flat node map** (`Record<NodeId, Node>` + `children: NodeId[]`) rather than a nested tree                        | O(1) lookup for selection, hover and edits; tiny snapshots; trivial reparenting; and it is the shape collaborative editing needs.                                                                                                                                                                    | High                                      |
| D4  | **The project document is stored as JSONB**, not as relational node rows                                                      | The doc shape changes often, it is always loaded whole, and snapshots must be atomic.                                                                                                                                                                                                                | Medium                                    |
| D5  | **Custom pointer-event drag and drop**, not HTML5 DnD and not `dnd-kit`                                                       | HTML5 DnD does not cross an iframe boundary cleanly and gives no control over drop indicators. Per-pixel insertion math is needed anyway.                                                                                                                                                            | Medium                                    |
| D6  | **One serializer per shared concern, used by runtime and codegen** (`schema/style.ts`, `integrationRequest.ts`, `powerbi.ts`) | Guarantees _canvas output === exported code_. This single rule prevents the #1 failure mode of visual builders: the export not matching what was designed.                                                                                                                                           | High                                      |
| D7  | **Registry-driven everything** — palette, props panel, renderer and codegen all read one `ComponentSpec`                      | Adding a component means adding one spec, not touching four subsystems.                                                                                                                                                                                                                              | High                                      |
| D8  | **Generated code targets CSS Modules**, with the emitter pluggable                                                            | Deterministic, readable, no config mapping, no class-name collisions. A Tailwind or shadcn emitter stays additive.                                                                                                                                                                                   | Low                                       |
| D9  | **Own auth**: email + password (argon2), JWT access token + httpOnly refresh cookie                                           | No third-party keys are needed to run the repo; the workspace and role model is ours anyway.                                                                                                                                                                                                         | Low                                       |
| D10 | **Autosave with an optimistic version check**, sending the whole document                                                     | Server-side conflict detection is what makes concurrent editing safe, and that is `baseVersion`, not the payload's size. D11 leaves no patch lying around to send, so producing one would mean diffing two snapshots purely to shrink a request of tens of kilobytes.                                | Low                                       |
| D11 | **Pure ops + document snapshots** for editor state and undo/redo, carried in React context                                    | `schema/ops` is pure and shares every node it does not touch, so a snapshot costs one object per changed node and an undo is an assignment — no inverse-patch path and no class of bug where an inverse is wrong. There is no Zustand in the repo.                                                   | Medium                                    |
| D12 | **Studio chrome is quiet by design** — neutral greys, hairlines, one accent, no gradients or decorative shadows               | The canvas is the only thing that should draw the eye. Loud tool chrome competes with the user's design and makes colour judgements unreliable. See §8.                                                                                                                                              | Low                                       |
| D13 | **shadcn's design and API, not shadcn's source** — plain CSS with shadcn's token names, variant taxonomy and geometry         | Gets the look and vocabulary without Tailwind in the runtime. shadcn ships no layout primitives, its overlays are 4–6 sub-components that do not map to one node, and its `cn()` classes would beat the declarations the inspector writes. Because props match 1:1, a shadcn emitter stays a rename. | Low — D8 makes emitters additive          |
| D14 | **The browser makes an integration's call, not the server**                                                                   | A proxy would keep the token server-side and solve CORS, and was refused deliberately; see §12.5 for what is guaranteed instead and what is not. Reversing it later is a route plus a catalogue source, not a document migration.                                                                    | Medium                                    |
| D15 | **An OAuth2 client-credentials exchange happens on the server** — the one exception to D14                                    | Every other scheme stores a credential that _gets sent_; this one stores a client secret that gets **traded**, and a client secret authenticates the whole application until it is rotated. What reaches the browser is a minted token that expires on its own.                                      | Low                                       |

---

## 2. Repository layout

```
ui-builder/
├─ apps/
│  ├─ web/                     # Vite + React studio (the builder itself)
│  │  ├─ src/
│  │  │  ├─ studio/            # the editor: rail, canvas, panels, toolbar
│  │  │  │  ├─ canvas/         # iframe host, viewport math, overlays, drop resolution
│  │  │  │  ├─ dnd/            # drag sessions, drop rules, drop context
│  │  │  │  ├─ palette/        # the library, grouped and searchable
│  │  │  │  ├─ symbols/        # the document's own components
│  │  │  │  ├─ layers/         # tree outline
│  │  │  │  ├─ pages/          # page list
│  │  │  │  ├─ data/           # page state and queries
│  │  │  │  ├─ expressions/    # `{{ }}` fields and scope completion
│  │  │  │  ├─ inspector/      # Design · Props · Interactions
│  │  │  │  ├─ code/           # the read-only export viewer
│  │  │  │  ├─ rail/ topbar/   # chrome
│  │  │  │  └─ state/          # StudioProvider: document, history, selection, saving
│  │  │  ├─ preview/           # preview route, device presets, share dialog, shared page
│  │  │  ├─ workspace/         # project grid, members, integration settings
│  │  │  ├─ routes/ shell/ ui/ # routing, app bar, shared primitives
│  │  │  └─ styles/tokens.css  # §8's tokens — the only place a colour is named
│  │  └─ canvas-frame.html     # the document loaded into the canvas iframe
│  └─ api/                     # Fastify + Prisma
│     ├─ src/
│     │  ├─ modules/           # auth, workspaces, projects, documents, publish,
│     │  │                     #   export, assets, integrations, health
│     │  ├─ plugins/           # jwt, cookie, prisma, storage, rate limit, errors
│     │  ├─ lib/               # roles, secrets, oauth, outbound (SSRF), imageInfo
│     │  └─ env.ts             # zod-validated configuration
│     └─ prisma/schema.prisma
├─ packages/
│  ├─ schema/                  # THE contract
│  │  ├─ doc.ts                #   document types + zod schemas
│  │  ├─ ops.ts                #   pure tree operations
│  │  ├─ style.ts cascade.ts   #   StyleSet -> CSS, and resolving a declaration back out
│  │  ├─ expr.ts               #   template parsing; takes its evaluator as an argument
│  │  ├─ migrate.ts            #   stored document -> current shape
│  │  ├─ symbols.ts pages.ts   #   document-level operations
│  │  ├─ integrationRequest.ts #   one request builder for three callers
│  │  ├─ powerbi.ts            #   the one response shape the protocol chose
│  │  └─ api/                  #   REST contract types, roles, capabilities
│  ├─ components/              # the built-in library
│  │  ├─ spec.ts registry.ts   #   `.` is data: no React, no lucide, no DOM
│  │  ├─ specs/                #   one file per component
│  │  ├─ react/                #   `./react` is the implementations and the icons
│  │  ├─ css.ts emit.ts        #   the library stylesheet, and the emit vocabulary
│  │  └─ runtime.ts            #   the modules an export ships when markup is not enough
│  ├─ runtime/                 # renders a page to real DOM; the one `new Function`
│  ├─ codegen/                 # ProjectDoc -> VirtualFile[] -> zip. Pure.
│  └─ tsconfig/                # shared TypeScript bases
├─ deploy/ compose.yaml        # Caddy, docker compose, backups
└─ package.json                # npm workspaces: apps/*, packages/*
```

**Dependency direction (never violate this):**

```
schema <- components        <- codegen <- web / api
schema <- components/react  <- runtime <- web
schema <- api
```

`schema` imports nothing from this repo and compiles against bare ES2023 — no DOM lib, no
Node types — so it cannot leak an environment into the contract the API, the studio and
the generator share. (`crypto` and `structuredClone` are not in that lib: the first is
reached for narrowly with a fallback, the second is a local `cloneJson`.)

Workspace packages ship TypeScript source rather than build output — Vite and `tsx`
consume it directly, so `npm run dev` never needs a build-the-dependencies step. Only the
API is bundled (tsup) for production.

---

## 3. The document model

The whole product is a set of editors over this one data structure.

```ts
// packages/schema/src/doc.ts

export type NodeId = string;

export interface ProjectDoc {
  schemaVersion: number; // migrations run on every server-side read
  id: string;
  name: string;
  pages: Page[];
  symbols: SymbolDef[]; // the document's own components
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
  state: StateVar[]; // page-scoped state
  queries: QueryDef[]; // data sources
}

/** A component the document owns, with a prop surface. See §12.3. */
export interface SymbolDef extends NodeTree {
  id: string;
  name: string;
  description: string;
  props: SymbolProp[];
}

export interface Node {
  id: NodeId;
  parentId: NodeId | null;
  type: string; // a registry key, or 'symbol:<id>'
  name: string; // the layer name
  children: NodeId[];
  props: Record<string, PropValue>;
  styles: StyleSet;
  events: Record<string, ActionStep[]>; // 'onClick' -> [ ... ]
  repeat?: RepeatSpec; // render once per item in a collection
  showIf?: PropValue; // renders only when this evaluates truthy
  hidden?: boolean; // the author's own toggle in the layers tree
  locked?: boolean;
}

export type PropValue = { kind: 'static'; value: Json } | { kind: 'expr'; code: string };

/** breakpointId -> pseudo-state -> declarations. 'base' is the mobile-first default. */
export type StyleSet = Record<string, Partial<Record<StyleState, StyleDecls>>>;
export type StyleState = 'default' | 'hover' | 'focus' | 'active' | 'disabled';
export type StyleDecls = Record<string, string | number>; // camelCase CSS props
```

`Theme` carries `colors`, `fonts`, `space`, `radii` and the breakpoint list.

### Why `styles` is structured, not a CSS string

`packages/schema/src/style.ts` exports `serializeNodeStyles(node, theme)`, returning a
class name and the CSS for it. The **runtime** collects every node's CSS into one `<style>`
tag in the canvas iframe; **codegen** collects the same CSS into a `Page.module.css`. Same
function, same output — D6 in practice.

`cascade.ts` resolves a declaration back out of the style set and says where it came from,
which is what every inspector field's placeholder, override dot and reset are built on.

### Tree operations are pure

```ts
insertNode(tree, { node, parentId, index }): NodeTree
moveNode(tree, { nodeId, newParentId, index }): NodeTree
moveNodes(tree, ids, target): NodeTree     // a multi-selection, landing contiguous
deleteNode(tree, nodeId): NodeTree         // cascades to descendants, steps and overlays
duplicateNode(tree, nodeId): NodeTree      // fresh ids, deep
topmostNodes(tree, ids): NodeId[]          // a selection is a set; a document is a tree
```

Every operation is generic over `NodeTree`, so a page and a symbol are edited by the same
code and each returns the type it was given. Purity is what makes the undo stack an array
of documents (D11) and "is anything unsaved?" a `!==`.

Two rules that fall out and are easy to get wrong:

- **The move index counts the dragged node itself.** The resolver measures the list the
  indicator was drawn over, which still contains the node in flight; `moveNode` compensates
  for its own removal. Making callers pre-adjust is the classic "drops one slot short when
  moving right" bug.
- **Deleting cascades into everything that pointed at it** — descendants, action steps
  naming the node, overlay targets. A `closeOverlay` naming a node that is gone is a button
  that silently does nothing.

### Migrations

`DOC_SCHEMA_VERSION` is **4**, and `migrateDoc` runs on every server-side read before
anything else sees the document. Changing the document types is a two-step edit: change
them, then add a migration keyed on the version it upgrades _from_. A migration's job is to
keep a project **openable**, not to be strict — `ProjectDocSchema` runs after it, so one
malformed event step would otherwise fail a whole document; the migration filters instead.
A document from a newer build is refused rather than guessed at.

Purely additive changes need no bump: a new `ActionStep` kind or a new `QuerySource` arm
cannot appear in a stored document, because there was no editor that could write one.

---

## 4. Database schema (Prisma)

```prisma
model User            { id, email @unique, passwordHash, name, createdAt }
model Workspace       { id, name, slug @unique, createdAt }
model WorkspaceMember { id, userId, workspaceId, role Role  @@unique([userId, workspaceId]) }
enum  Role            { OWNER ADMIN EDITOR VIEWER }

model Project         { id, workspaceId, name, slug, thumbnailUrl,
                        currentRevisionId, version Int,        // D10 optimistic lock
                        createdAt, updatedAt, archivedAt? }
model ProjectRevision { id, projectId, doc Json, version Int, label?, authorId, createdAt
                        @@index([projectId, version]) }
model Publish         { id, projectId, revisionId, slug @unique, publishedAt }
model Asset           { id, projectId, url, mimeType, width?, height?, bytes }

model ApiIntegration  { id, workspaceId, name, slug, baseUrl, auth Json,
                        secretCipher Bytes?, defaultHeaders Json, contentType
                        @@unique([workspaceId, slug]) }      // AES-256-GCM at rest
model ApiEndpoint     { id, integrationId, name, method, path, headers Json, body?,
                        resultPath, sampleResponse Json?, sampledAt? }

model RefreshToken    { id, userId, tokenHash @unique, expiresAt, revokedAt? }
```

**Revision strategy.** The head revision _is_ the document: `Project.currentRevisionId`
points at it, and an autosave inside the throttle window updates that row in place rather
than adding one — otherwise a twenty-minute styling session leaves hundreds of rows nobody
will open and buries the few worth finding. A new revision is broken out when the head is
older than `REVISION_INTERVAL_MS`, when it is labelled, **when a published link points at
it**, or **when the author changed**. The general rule: a revision anything else points at
is immutable.

**The optimistic lock is a conditional `updateMany`, not a read-then-write.** Two saves
racing on the same base version both pass a read; only one can match
`where: { id, version: baseVersion }`. It runs first inside the transaction that writes the
revision, so a later failure cannot leave a version pointing at the old document.

**`not_found` vs `forbidden` is deliberate:** a non-member gets 403 for a workspace that
exists and 404 for one that does not — the id is not a secret, membership is.

---

## 5. Canvas architecture

```
┌─ Studio window (React root #1) ───────────────────────────────┐
│  Rail    │  ┌─ Viewport (pan/zoom transform) ──┐  │ Inspector │
│  Panel   │  │  ┌─ <iframe> (React root #2) ─┐  │  │           │
│          │  │  │   <PageRenderer editing /> │  │  │           │
│          │  │  └───────────────────────────┘  │  │           │
│          │  │  ┌─ Overlay layer (absolute) ─┐  │  │           │
│          │  │  │ selection, drop line,      │  │  │           │
│          │  │  │ handles, labels, band      │  │  │           │
│          │  │  └───────────────────────────┘  │  │           │
│          │  └─────────────────────────────────┘  │           │
└───────────────────────────────────────────────────────────────┘
```

**The rules that keep this sane:**

1. **Two React roots, one store.** The iframe mounts its own `createRoot` and does _not_
   share React context with the parent — context does not cross realms reliably. The store
   is handed over through `contentWindow` on load. Same-origin, so this is legal.
2. **Overlays live in the parent, never in the iframe.** Drawing selection chrome inside
   the iframe would pollute the user's DOM and break export fidelity.
3. **Rect math goes through one helper.** `canvas/viewport.ts` is where the three
   coordinate spaces meet — frame space (a rect measured inside the iframe), area space
   (the scrollport the artboard floats in) and studio space (client coordinates, where
   overlays live). Never inline `elRect * zoom + iframeOffset`; that is where zoom bugs
   come from.
4. **Zoom** is `transform: scale(z)` with `transform-origin: 0 0`; pan is `translate()`.
   Ctrl/⌘+wheel and trackpad pinch zoom toward the cursor; plain wheel and two-finger pan;
   space-drag, middle-drag and backdrop-drag pan; the toolbar has −/percentage/+ with ⌘−,
   ⌘+, ⌘0 and ⌘1.
5. **Hit-testing** is `iframeDoc.elementsFromPoint(x/z, y/z)`, walking up to the nearest
   element carrying `data-node-id`.

**The iframe is a separate realm, so `instanceof` is a trap.** `target instanceof Element`
is _false_ for every element on the canvas, and it fails silently — selection and hover
simply never fire. Everything that inspects a canvas event duck-types
(`typeof el.closest === 'function'`) instead, including components that run in both realms.

Notes that were paid for once:

- **The pan offset never appears in a conversion.** The transform is applied by the browser
  to a real element, so the frame's own `getBoundingClientRect()` already accounts for it; a
  projection only adds back the _scale_. Reading the frame rect per call rather than caching
  it is what makes that true — pan, zoom and a panel resize all move it without firing
  anything a cache could subscribe to.
- **A pan is measured from where it started, not summed move to move.** Accumulating deltas
  makes every event load-bearing: one coalesced `pointermove` and the canvas is permanently
  offset. An absolute anchor (origin viewport + origin pointer) recovers on the next move.
- **The frame is made inert imperatively at pan start**, not on the next render — its client
  coordinates travel with the pan, so a move it received would report a delta of zero.
- **React attaches `wheel` listeners passively**, and a passive listener may not call
  `preventDefault`, which is the whole job. Both are registered by hand with
  `{ passive: false }`. A trackpad pinch arrives as a wheel with `ctrlKey`, so the modifier
  and the pinch are one branch.
- **Thickness is chrome, length is design.** A drop indicator's span scales with zoom and
  its 2px thickness does not, so the two are computed separately. Same rule keeps the
  selection outline out of the transformed scene — a 2px outline would be 0.5px at 25%.
- **The artboard's size is a property of the design** (1024×768 by default), not "however
  big the panel is": a layout that reflows when the inspector is dragged cannot be judged.
  Breakpoint chips and device presets are controls over that number. Zoom-to-fit is capped
  at 100%, because scaling a design _up_ makes every judgement about type size wrong.
- **`preventDefault` on the frame's `pointerdown` keeps the design inert but also freezes
  focus**, so selecting on the canvas explicitly moves focus to the canvas area. It also
  cancels the compatibility double-click, which is why a layer row suppresses text
  selection with `user-select` instead.

### The canvas is an editing view, not just a viewer

- **`serializePageStyles` takes an `upTo` breakpoint.** Editing `base` on a 1024px artboard
  would otherwise show `lg` rules the panel is not displaying, and the field and the canvas
  would disagree about the same node. The cap only ever _narrows_; preview and codegen pass
  no cap.
- **The breakpoint chips resize the artboard** to that breakpoint's own `minWidth` — the
  narrowest width at which its rules apply is exactly the width that proves they do.
- **`serializeStatePreview` forces the selected node's pseudo-state on.** The canvas
  swallows pointer events, so a `:hover` rule can never fire there. The rule doubles the
  node's class rather than using `!important`, which would also beat the real `:hover` once
  the preview is switched off. It is editor chrome, generated outside `serializePageStyles`,
  so neither preview nor export can inherit it.
- **Interactive components are frozen.** A component whose spec says `interactive` (a table
  whose rows drag, an accordion, a form control) is delivered `readOnly` on the canvas: the
  gesture that operates it is the gesture that moves the node.

### Selection

The selection is an ordered array, with the _primary_ — added last — answering every
question that still has a single answer: whose values the inspector shows, whose
pseudo-state is forced, where a Shift-range starts.

Four ways to make one: Ctrl/⌘-click anywhere; Shift-click and Shift+arrow in the layers
tree; Ctrl/⌘+A; and a rubber band on the canvas, live. Every Design field then writes to the
whole selection and shows `Mixed` where its members disagree; Delete and ⌘D act on all of
it; dragging one member carries the rest, landing contiguous and in document order.

- **The band takes the shallowest node it touches and stops.** Returning everything it
  overlaps would hand back a card _and_ its heading _and_ its text. Its rects are
  re-measured on every move — a pan mid-band moves every element.
- **A press must not commit to what it means.** Pressing something already in a
  multi-selection leaves the selection alone, or the drag that follows carries one node;
  narrowing back to one is `onClick`'s job, which fires only when the gesture never passed
  the movement threshold.
- **The selection is derived, not corrected.** An undo can remove the node the inspector is
  pointed at. Treating a stored id that no longer names a node as "nothing selected" has no
  render in which the panel points at a node that is not there — and it reselects the node
  when a redo brings it back, for free.
- **`hidden` and `locked` are inherited, not per-node**, or a click inside a locked card
  could still drag the heading out of it.

---

## 6. Drag and drop

Two sources, one target system.

- **New node** — dragged from the palette. Payload `{ kind: 'new', componentKey }`.
- **Move** — an existing canvas node or a layers-tree row. Payload `{ kind: 'move', nodeId }`.

**Drop resolution** (on every pointermove, throttled to rAF):

1. Hit-test the point → candidate element → `nodeId`.
2. Walk up until a node whose spec says `acceptsChildren`.
3. Read that container's computed `flex-direction` (or grid).
4. Compare the cursor against each child's rect **along the main axis**: inside the first
   25% → insert before, the last 25% → insert after, the middle 50% and the child accepts
   children → descend into it.
5. Emit `{ parentId, index }` and draw a 2px indicator at the computed gap.
6. Reject a drop where the new parent is a descendant of the node in flight.

The edge band that means "beside this, not inside it" stays in **frame** pixels: the outer
quarter of a card is the same part of that card at any zoom.

The line says _where_ but not _what next to_, so the target also carries a **context** — the
receiving container's name and bounds, and the nearest sibling that is not the node in
flight — drawn as a faint outline plus a label ("after Card", "into Stack"). Both surfaces
answer with it, from `dnd/dropContext.ts`.

**Empty containers** get a dashed placeholder with a minimum hit area, so an empty stack is
still a target.

Three structural rules:

- **One gesture spans two documents.** A press in the palette is captured by the studio's
  document and a press on the canvas by the frame's, and the pointer can then cross into the
  other — which never saw the first event. A drag session listens on both surfaces, and each
  converts its own coordinates to studio space.
- **Two drop surfaces need an order, not a set.** The canvas resolver answers for _any_
  point (a miss falls back to the page root), so it can never be asked first.
  `DROP_SURFACES` fixes the order — layers, then canvas — and every resolver returns null
  outside its own bounds, which is what makes that total. A hidden tree has a zero rect at
  the origin and must decline, or it claims a drop at exactly (0, 0).
- **Legality and geometry are separated.** The canvas and the tree work out _where_
  completely differently, but if they disagree about what is _allowed_, the indicator
  promises drops the commit refuses. `dnd/rules.ts` is the one copy of
  `canReceive`/`canDrag`; each resolver keeps only its own arithmetic.

---

## 7. Component registry

One spec per component. This single object feeds the palette, the search index, the props
panel, the renderer and the generator (D7).

```ts
export interface ComponentSpec {
  key: string; // 'VStack' — stable, used in the document and in codegen
  displayName: string;
  category: 'Layout' | 'Basic' | 'Form' | 'Data' | 'Media' | 'AI' | 'Overlay';
  icon: string; // a lucide name, not a component — a spec holds no React
  keywords: string[]; // search fuel
  description: string;

  props: PropSpec[]; // drives the auto-generated Props tab
  events: string[]; // 'onClick', 'onSelect', …
  eventPayloads?: Record<string, string>; // what a non-DOM event hands the handler
  acceptsChildren: boolean;
  isVoid?: boolean;
  symbolOnly?: boolean; // offered only while a component is open (Slot)
  layout?: 'flex' | 'grid'; // set by the library's CSS, not by the document
  unsupportedStyles?: readonly string[]; // rows the Design tab hides — see §9
  interactive?: boolean; // the canvas freezes it
  overlay?: boolean; // openOverlay / closeOverlay may target it

  defaultProps: Record<string, Json>;
  defaultStyles: StyleDecls;

  codegen: {
    importFrom?: string; // undefined => a plain intrinsic element
    tag: string;
    emit?: EmitElement; // the markup, as inert data
  };
}

export type PropSpec =
  | { name; label; type: 'string' | 'text' | 'data' | 'number' | 'boolean' | 'color' | 'url' }
  | { name; label; type: 'enum'; options: EnumOption[] }
  | { name; label; type: 'palette'; swatches: string[] };
```

**A spec is data.** No React, no lucide, no DOM anywhere it reaches — which is why `icon` is
a string and why the API can read the whole registry, and every `emit` template, without
React in its bundle. The implementations are a separate entry point
(`@ui-builder/components/react`), joined back by `key`, and `implementations.test.ts`
asserts both directions of that join — React 19's `JSX.ElementType` includes bare `string`,
so `<Icon />` where `Icon` is the _name_ `'Square'` compiles clean and fails only at
runtime.

Adding a component is four edits: `specs/<Name>.ts`, `react/<Name>.tsx`, a line in `SPECS`,
a line in `COMPONENTS`. Tests fail the build on a missing `emit` template, a missing
implementation, and a CSS rule for an enum option that has none.

### The library

| Category    | Components                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| **Layout**  | `Box`, `VStack`, `HStack`, `Grid`, `Spacer`, `Divider`, `Scroll`, `Slot`, `Header`, `Footer`, `SideNav`, `Breadcrumb` |
| **Basic**   | `Heading`, `Text`, `RichText`, `Button`, `Link`, `Badge`, `Avatar`, `Alert`                                           |
| **Form**    | `Input`, `Textarea`, `Select`, `MultiSelect`, `Radio`, `Checkbox`, `Switch`, `Slider`, `DatePicker`                   |
| **Data**    | `Card`, `Table`, `Chart`, `Progress`                                                                                  |
| **Media**   | `Image`                                                                                                               |
| **AI**      | `ChatThread`, `ChatMessage`, `PromptInput`, `TypingIndicator`, `CodeBlock`, `ToolCall`, `Citation`, `SourceCard`      |
| **Overlay** | `Modal`, `Drawer`, `Tabs`, `Accordion`, `Tooltip`                                                                     |

Per D13 these are shadcn's design, not shadcn's source: `Button` takes
`variant` (`default | secondary | outline | ghost | destructive | link`) and `size`
(`sm | default | lg | icon`), styled against `--primary`, `--muted-foreground`, `--ring` and
the rest of the token set `serializeTheme` emits.

**A list of choices is data, not a subtree.** `Select`, `MultiSelect` and `Radio` author
their options as text; `Table` takes `Name | Role | Status` and a line per row; `SideNav`,
`Header`, `Footer` and `Breadcrumb` author links as `/path | Label`. The reason is the same
each time: forty cells assembled as forty nodes are forty things to select and keep in step,
and the fact that makes them a group — every row has the same columns, one nav item is
current — would live nowhere. A radio group whose members are separate nodes is not a group
at all. Each can gain a compound form later without a stored document changing, because the
content already lives in a prop.

`codegen` owns the transforms that expand those: `options`, `radios`, `checkOptions`,
`chips`, `navItems`, `markdown`, `tableHead`, `tableRows`. Reach for one only when a static
template genuinely cannot say the shape.

**Overlays render in flow.** A `Modal` is a dimmed stage with a panel centred in it. Pinned
to the viewport it would cover the page being designed and sit outside every rect the canvas
hit-tests, so it would be a component nobody could select; a design that wants it fixed says
so in the Design tab. A closed overlay is drawn anyway, dimmed and labelled `Closed` — a
modal that vanished because nothing had opened it yet is one nobody could wire up.

Other decisions worth not re-litigating:

- `RichText` is Markdown parsed by `components/markdown.ts` into a tree that the runtime
  renders as elements and codegen prints as static JSX, from the same parse — so D6 holds by
  construction, there is no `dangerouslySetInnerHTML` in the path, and the export ships no
  Markdown parser. Raw HTML is excluded permanently, not pending.
- `Accordion` is native `<details>`, so an export opens and closes with no JavaScript.
  `Tooltip` is the same trick with `:hover`/`:focus-within`, and its `visible` is a real prop
  — a pinned tooltip ships pinned, which is D6 rather than a convenience.
- `Progress` is a native `<progress>` and `DatePicker` a native date input: the browser owns
  the control and announces it without an `aria-` prop being typed.
- `Alert`'s icon is an empty span the stylesheet fills, so one piece of markup covers four
  states and the export still ships no icon set.
- **AI** is the one category whose members are compositions rather than primitives. They are
  components because `role` has to move four things at once — which side the row sits on, how
  the bubble is coloured, whether the avatar shows, whether the body is a bubble or a centred
  system line — and because `PromptInput`'s surface is its _wrapper_. `CodeBlock` is a frame,
  deliberately not a highlighter: highlighting means shipping a tokenizer and a grammar into
  every exported project.
- `Icon` is the standing gap in Basic. It needs an `icon` PropSpec type and a picker, and
  neither can be written until the library's icon set is chosen — shipping ~1500 lucide icons
  to render one is a bundle decision, not an inspector one. `Form` and `List` are the others.

### The one-class CSS rule

Every selector in `packages/components/src/css.ts` weighs exactly one class: any `[data-*]`
is wrapped in `:where()`, and there is no `!important` anywhere. The per-node rules the
inspector writes are emitted last, so they always win on source order — and a rule that
out-specifies `.ub-n-<id>` silently breaks the Design tab for that component.
`css.test.ts` fails the build on a bare attribute selector, an `!important`, unbalanced
braces, a backtick (the sheet is a template literal), an enum option with no rule, and a
`var(--token)` the theme does not define.

For the same reason **a component never sets an inline style from a prop** — an inline style
beats every stylesheet. It renders a `data-*` attribute and the sheet matches it.

**Inheritable properties are the exception the rule does not cover.** Inheritance is not a
weak declaration that loses a specificity contest; it is the absence of one, so
`.ub-table-header { font-size: 12px }` beats an inherited value outright however low its
specificity — which made Typography silently do nothing on every component that draws its own
text from a prop. The rule now: **a root may size itself in pixels; anything inside one is in
`em`**, each ratio being the pixel value it already was against the parent it actually has.
Quiet colour derives from `currentColor` rather than naming `--muted-foreground`, so it keeps
the de-emphasis _and_ follows the field.

### Behaviour, when markup cannot say it

An export is markup. `components/src/runtime.ts` is the narrow hatch for the rest, and it has
three members:

- `SortableRows` — a table whose rows can be dragged into a new order.
- `Overlay` — opening, closing, focus and dismissal.
- `Chart` — the one that is not a wrapper.

The rule for the first two is that a module must be a **wrapper**: it takes the markup the
template already produced as children and adds behaviour, never markup of its own. So the
canvas and the export render the same elements and differ only in what can be done to them.
A chart cannot obey that, and not because the rule is inconvenient — **a chart's markup _is_
its data**: five rows are five rects at coordinates nothing knows until the query answers, so
there is no markup to wrap. D6 is kept the other way instead, the way `values.ts` and
`powerbi.ts` already keep it: one component written twice and pinned body-for-body by
`runtime.test.ts`. That is the stronger promise — the canvas and the export do not merely
render the same elements, they run the same code. The bar for a fourth module is that it can
say the same thing about its own shape.

A component that ships behaviour also sets `interactive: true`, so the canvas freezes it. A
document that reaches for none of these gets no `src/components/` directory at all.

### Search

A `fuse.js` index over `displayName + keywords + category`, weighted toward `displayName`.
Results grouped by category, arrows navigate, Enter inserts into the current selection,
Ctrl/⌘+K focuses.

---

## 8. Studio design language

The studio must look like a tool, not a website. Plasmic, Figma and Webflow land in the same
place for the same reason: **the canvas is the only saturated thing on screen.**

**Rules (D12):**

- **One accent, used sparingly.** A single blue for selection, focus rings, active tabs and
  primary buttons. Nothing else is coloured, and canvas selection chrome uses that same blue.
- **Neutral greys with a faint cool bias.** Panel background a half-step off white, canvas
  backdrop a half-step darker so the artboard reads as a lifted surface. Dark theme is the
  same system inverted, not a different design.
- **Hairlines, not shadows.** 1px borders separate panels; shadows appear only on things that
  genuinely float — menus, popovers, the drag ghost.
- **Dense but not cramped.** 28px inspector rows, 24px layer rows, 11–13px UI text. Labels
  are sentence case in muted grey; values are near-black.
- **Small radii.** 3–4px. Nothing pill-shaped, nothing at 12px+.
- **Icons over words** in the toolbar and tree, always with a tooltip. Words in the
  inspector, where precision matters more than density.
- **No decoration.** No gradients, no glass, no emoji, no illustrative empty states. An empty
  canvas says "Drag a component here" in muted grey and nothing more.
- **Motion is functional only.** Panel and menu transitions at 120–150ms; nothing on the
  canvas animates except drag feedback.

Implementation: CSS custom properties in `apps/web/src/styles/tokens.css`, plain CSS Modules
for studio components, and Radix primitives for the _behaviour_ of menus, popovers, tabs,
tooltips and sliders — unstyled, so the look is ours and every menu in the studio cannot
drift apart. Tailwind is deliberately absent, so there is no ambiguity between studio styles
and the CSS the builder generates.

**The left rail.** A 44px icon rail switches between Pages, Insert (the library), Components
(the document's own), Layers and Data, and the chosen view gets the whole column; pressing
the open one collapses the panel. Three cramped stacked panels read worse than one useful
one. Inactive views stay **mounted and hidden**, so switching back finds the palette scrolled
where it was left.

---

## 9. Inspector

Tabs: **Design** · **Props** · **Interactions**.

**Design** writes to `node.styles[breakpoint][state]` across the whole selection: Layout,
Size, Spacing (a visual box editor), Typography, Background, Border and radius, Shadow,
Opacity, Position. Every control is token-aware — a colour field offers `theme.colors` first,
raw hex second. A breakpoint switcher and a state switcher sit at the top; edits land in
whichever cell is active, and any non-base cell shows an override dot with a reset.

**Props** is generated from `ComponentSpec.props`. Nothing is hand-written per component, and
every prop is bindable: a `{ }` toggle on each row swaps its control for an expression field.

**Interactions** is generated from `ComponentSpec.events`: an event → step-list editor, plus
`repeat` and `showIf` under Rendering. It writes to the _primary_ selection only — an action
list is a sequence authored for one thing.

The rules behind the controls:

- **A field shows its own value or nothing.** Rendering the inherited value as content makes
  every breakpoint look fully specified and leaves no way to tell a value that is _set_ from
  one that merely _applies_. The inherited value is the greyed placeholder; `resolveDecl`
  returns the origin so that distinction is made once rather than per field. A field the
  selection disagrees on shows `Mixed` and holds no value — a box holding one member's value
  invites a keystroke that would quietly flatten the others.
- **A CSS length is not a number.** `auto`, `50%`, `2rem` and `var(--space-4)` all have to be
  typeable in one box. A bare number becomes a number in the document (the serializer appends
  `px`), anything else stays a string, empty clears the property, and arrow-key stepping is
  added back by hand for the numeric case.
- **Fields commit on blur and Enter, never per keystroke** — otherwise `1`, `16`, `16p`,
  `16px` all reach the document and all four become undo steps. Escape abandons. A multi-line
  prop commits on blur only, because Enter is a newline there.
- **Component defaults are shorthands, so the box editor falls back to one.** `padding: 16`
  in a spec leaves all four longhands unset, and four empty fields on a node with obvious
  padding reads as broken.
- **The panel cannot decide what to show from the document alone.** A `VStack` is
  `display: flex` because of a rule in `css.ts`, with nothing in the node saying so, so gating
  the flex rows on the node's resolved `display` hid `align-items` on exactly the components
  it exists for. `ComponentSpec.layout` declares it, and the document still wins when it says
  anything.
- **`unsupportedStyles` closes rows the node would accept and then ignore.** A chart draws
  labels inside a `viewBox`, where `font-size: 16` means sixteen one-hundred-and-eightieths
  of the chart's height; a field that accepts a number and means something else by it is worse
  than an absent one. The bar for adding a key is _no declaration could make this work_, not
  _this is awkward_ — a component whose own stylesheet out-declares the inspector is a bug in
  `css.ts` instead.
- **A colour swatch paints a resolved copy of its value, and commits the original.**
  `var(--primary)` is a token of the _design's_ theme, which is a different document from the
  studio chrome the inspector is drawn in, so the swatch painted nothing and reported a colour
  as missing when it was only defined elsewhere. `paintable` resolves it for display only.
- **An inspector tab is keyed by node id.** A field holds a draft committed on blur, and two
  components can declare a prop of the same name — `text` is both a Text's body and a Button's
  label. Without the key React reuses the field across a selection change and the draft typed
  for one node commits onto the next. It is a data-corrupting bug no unit test here would
  catch, and the fix is one `key`.
- **A `<label>` wraps the control and nothing else.** Wrapping the field _and_ its hint makes
  the input's accessible name the whole paragraph. The hint and the validation line are
  siblings, and `htmlFor` names the control.

---

## 10. Interactions, state and data

```ts
export interface StateVar {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  initial: Json;
}

export type QuerySource =
  | { kind: 'url'; method: HttpMethod; url: string; headers?; body? }
  | { kind: 'integration'; integrationId; endpointId; variables? } // §12.5
  | { kind: 'powerbi'; integrationId; datasetId; groupId?; dax }; // §12.6

export interface QueryDef {
  id: string;
  name: string;
  source: QuerySource;
  runOnLoad: boolean;
}

export type ActionStep =
  | { kind: 'setState'; stateId: string; value: PropValue }
  | { kind: 'toggleState'; stateId: string }
  | { kind: 'setFilter'; stateId: string; value: PropValue } // §12.7
  | { kind: 'runQuery'; queryId: string }
  | { kind: 'navigate'; to: PropValue }
  | { kind: 'showToast'; message: PropValue }
  | { kind: 'openOverlay'; nodeId: NodeId }
  | { kind: 'closeOverlay'; nodeId: NodeId }
  | { kind: 'custom'; code: string };
```

**A step's values are `PropValue`, not a separate expression type**, so `navigate to
'/about'` is a literal and `navigate to {{ state.next }}` is an expression, edited by the
control that already edits props.

**A step names its target by id** — `stateId`, `queryId`, `nodeId` — so a rename cannot
silently break every handler that used it. Expressions still reference state by _name_,
because expression text is free-form and nothing can rewrite it safely; that asymmetry is
what the panels' usage lists and rename warnings exist for. (A symbol's props are the
deliberate opposite: they are a structured record, so `renameSymbolProp` moves the key on
every instance and that is exact.)

**Render scope.** Every expression evaluates against `{ state, queries, item, index, props,
theme }`. `item`/`index` exist only inside a `repeat`; `props` only inside a component. A
query is read as `queries.<name>` and carries `{ loading, data, error }` rather than the
payload alone — a list that has to say "loading" cannot do it from the rows.

**The stored form is what was typed.** `code` is **template source** — `Hello {{ state.name
}}`, holes and all — not a compiled expression, so a field round-trips back into the
inspector by parsing rather than by decompiling a template literal. A hole standing alone
yields the raw value (`{{ state.busy }}` on `disabled` is `false`, not `"false"`); mixed
content is a string. That rule lives in `evaluateTemplate`, so the canvas, the preview and
the export cannot each decide it differently.

**Nothing rewrites an expression the author typed.** The alternative — state named `count`
emitting `const [count, setCount]`, and every `state.count` rewritten — needs a source
transform reliable enough to edit user code, which a regex is not and a parser would be a
dependency. The generated component defines `state`, `queries`, `item` and `index` _around_
the text instead, so the canvas and the export evaluate the same string (D6). It is also why
the reference scan can stay a conservative regex: it feeds usage lists and warnings, and
nothing depends on it being exact.

**`parseTemplate` is total.** An unterminated `{{` is text, because a field is re-parsed on
every keystroke and half a typed expression must not blank the canvas. Its naivety is the
price — the first `}}` closes a hole, quotes and all — and a test asserts exactly that, so the
limit is a decision with a name on it.

**The package that defines evaluation is the package that cannot evaluate.** `expr.ts` has no
`new Function` and never will: `evaluateTemplate(source, evaluate)` takes the evaluator as an
argument, which makes "only one realm can run this" a fact about the module graph rather than
a convention. The one `new Function` in the repository is in `packages/runtime`, inside the
canvas iframe. `integrationRequest.ts` follows the same shape for the same reason — the API
imports `schema` and must never gain the ability to run an expression a user typed.

**Errors are caught per node** and surfaced as a red badge on that node, never as a crashed
canvas.

**Handlers do not run on the canvas.** `PageRenderer` evaluates bindings, `repeat` and
`showIf` identically whether editing or not, and attaches handlers only when not — on the
canvas a click selects a node.

**A step sees the scope as it was when the event fired.** The exceptions are `toggleState`
and `setFilter`, which compare against what the store holds (`setState(current => …)` in the
export), so two toggles in one handler are two flips rather than one.

**The Data panel is in the left rail, not an inspector tab.** State and queries belong to the
_page_, and a panel that emptied itself when the canvas was clicked would be unusable for what
it is for — writing a variable, then binding it. A query that reads its own result says so and
cannot be set to auto-run, via the same `cyclicQueries` the runtime and the generator use, so
none of the three can disagree about which query is refusing to run.

---

## 11. Code generation

```ts
generateProject(doc: ProjectDoc, opts): VirtualFile[]   // pure: no I/O, no clock, no formatter
projectArchive(doc, opts): Uint8Array                   // the same, zipped
```

Emitted project:

```
package.json          vite.config.ts       index.html      tsconfig.json
src/main.tsx          src/App.tsx          # a router over doc.pages
src/theme.css         # CSS variables from doc.theme
src/library.css       # the component library's own rules, shipped verbatim
src/pages/Home.tsx    src/pages/Home.module.css
src/components/…      # a symbol, or a component that is behaviour rather than markup
src/lib/…             # values, query, toast, navigate, powerbi
.env.example          # VITE_<SLUG>_TOKEN per integration the document uses
```

The last two directories appear only in a project that reaches for them, and each `src/lib/`
file ships independently — a page with one binding and no queries gets `values.ts` alone.

**Pipeline:** document → IR (`JsxElement` tree) → string. The printer formats on the
structure it already knows rather than handing the result to Prettier, which is what keeps
`generateProject` synchronous and dependency-free — the same function runs in the studio's
code panel, in the API's zip route and in a snapshot test. Building an IR first is what makes
`repeat` → `.map()`, `showIf` → `&&` and expression inlining tractable; `when` and `map` are
IR nodes for exactly that reason, and a handler declared _inside_ a `.map()` block body is why
the IR carries statements rather than the walker assembling strings.

**Neither Prettier nor a zip library is a dependency.** Both would be a version to drift
between the studio's in-browser generation and the API's route. `ir.ts` formats its own
output and `zip.ts` writes its own archive (stored, not deflated — an export is a dozen small
text files, and compression is the only part of a zip writer that is hard to get right).

**What is generated per page is readable code naming the author's own variables:** state as
`useState`, each query as a hook whose request interpolates the page, each event as a named
handler. What would be identical in every project is **shipped whole** in `src/lib/`. That is
the same bargain `EmitModule` strikes, rather than a loosening of it.

**The generated project's own `tsc` is a test**, and it fails on things a snapshot cannot see.
`noUnusedLocals` means a page declaring a setter nobody calls does not build — which is why
the state declaration uses array elision (`const [, setState]`), why a handler's `event`
parameter is emitted only when a step actually reads one (a scan that strips string literals
first), and why the query block is generated before the state declaration although it is
written after it: a query's _request_ can read names the markup never mentions. `list()`
returns `any[]` rather than `unknown[]`, because rows come out of a request whose shape
nothing knows and `item.name` under `strict` would be an error the author cannot fix from the
builder.

**Fidelity (D6)** is held three ways, because it has three seams:

1. **CSS** — `*.module.css` is produced by the same `serializeNodeStyles` the canvas uses.
2. **Markup** — a component's exported shape is the `emit` template on its spec, which the
   renderer and the generator both read.
3. **Code that cannot be shared** — `src/lib/values.ts`, `src/lib/powerbi.ts` and the chart
   ship to a stranger and so cannot import this repo. Each is a second copy, and a test runs
   or compares both copies over the same inputs, which is the only thing that would notice
   them drifting. (`Number(null)` is `0` — that is how the one real divergence was found: a
   bound number prop reading a field that had not loaded exported as zero where the canvas
   showed the fallback.)

**What a binding cannot reach, the export says out loud.** A named transform exists because
the _shape_ of what it emits is the text it parses. `Table.rows` and `Select.options` now take
an array as well — a table declares `fields`, a select `valueField`/`labelField`, and
`buildTable`/`buildOptions` decide which kind they were given, so canvas, preview and export
cannot render different rows. The rest (`radios`, `navItems`, `tabs`) still expand as if the
field were empty and add a warning naming the node and the prop; `markdown` is the one to
leave alone, because making it dynamic means shipping the parser §7 says an export never
carries. A bound element _name_ (a `Heading` whose level is an expression) is the same
bargain: `<Tag />` is legal React but needs a capitalised binding in scope.

**The one place the export is less forgiving than the canvas, and it says so.**
`queries.<name>.data` is `undefined` until the request answers, so
`{{ queries.rows.data.items }}` throws on the first render. The canvas survives it — the
evaluator catches per expression, the node renders with the prop unset and wears a badge —
and the exported page cannot: a per-node boundary would mean emitting elements the canvas
does not (D6). Two halves, fixed two different ways. The **type** was the export's own
`tsc` rejecting the project: `QueryResult.data` was `unknown`, so any read through it was a
compile error in generated code the author cannot edit — it is `any` now, `list()`'s
argument applied one helper over. The **timing** is `unguardedQueryReads` in `walk.ts`, a
warning rather than a fix, for `staleQueryWarnings`' reason: `{{ queries.rows.data?.items }}`
is ordinary JavaScript that behaves identically on both sides, and wrapping every emitted
binding in a guard would rewrite the shape of the author's code to compensate for something
they can say themselves. It fires on render-time sites only — a step runs on a click, long
after the request answered, and a throw there costs that click rather than the page — and
stays quiet where the expression already guards itself (`?.`, `&&`, a ternary, a mention of
`loading`) or where a `showIf` on the node or an ancestor holds it back.

**Delivery.** `GET /api/projects/:id/export` streams the zip for programmatic and CI use; the
studio's **Code** button opens a read-only viewer over the same files and downloads the same
archive, generated in-browser. It reads the live document rather than the server's — a panel
lagging a second behind the canvas would answer a question nobody asked — and it is also
forced, since the access token is in memory only and a plain `<a href>` could not carry it.

---

## 12. Built on top of that core

### 12.1 Persistence, undo/redo and history

A document loads from the API, autosaves on a debounce, keeps a coalesced undo stack of 500
steps, and carries a version history with named versions and restore.

- **The history is a stack of documents, not of patches** (D11). Because every op shares
  every node it did not touch, a snapshot is one object per changed node and an undo is an
  assignment. `state/history.ts` is generic over the value and has no React in it.
- **A conflict is a choice, not a rebase.** With two whole documents and no record of which
  fields each side touched, a merge would have to guess, and a guess that silently drops half
  of someone's styling is worse than any dialog. The studio fetches the other side, stops
  autosaving, and offers "keep mine" or "discard mine" — and because a restore is a forward
  write, neither button does anything unrecoverable.
- **A failed save must not re-arm the debounce.** The document is still dirty after a
  rejection, so the effect fires again — against an unreachable server that is a request per
  second forever. `failedDoc` records what was refused; editing anything produces a new
  document and retries on its own.
- **The studio is keyed on the project id.** Every piece of state below it — document,
  history, save baseline, viewport — is about _that_ project, and resetting each by hand when
  the prop changes is a list that would be incomplete the first time one was added.
- **`role` is on `ProjectSummary`**, because the editor has to know whether it is read-only
  before it renders.
- React's compiler lint forbids reading or writing a ref during render, which the obvious
  autosave hook does twice. Both became state — the save baseline changes once per save, not
  once per edit — and `unsaved` then falls out as a derived value the indicator and the unload
  guard share.

### 12.2 Preview and publishing

`/preview/:projectId/:pageId` renders the runtime with `editing=false`, at mobile, tablet and
laptop sizes, and can publish to a public link at `/s/:slug`, served by the API's own
unauthenticated `/api/published/:slug`.

- **A preview is a viewport, not a scale.** The obvious device preset is a width on a wrapper,
  and it is wrong: `@media (min-width: 768px)` would still read the browser window, so a
  "phone" preview would quietly show the desktop layout — the exact thing someone opened it to
  check. The preset sizes the iframe, so the design's own media queries resolve against it.
- **The preview reads the API, not the studio.** It is a view of what is _saved_, because that
  is what a shared link and an export are built from. The cost is that the Preview button
  flushes the autosave first.
- **A publish is a snapshot.** The `Publish` row points at a `ProjectRevision`, not at the
  project, so what a link shows is fixed when the button is pressed — otherwise a reviewer
  opens whatever half-finished state the author is in right now. The share dialog says so, and
  says when the link has fallen behind. This is why an autosave may not rewrite a revision
  something else points at (§4).
- **The slug is a capability, so it carries a token.** `landing-page` is guessable and the
  endpoint needs no credential beyond it; `landing-page-k3f9d2q7` is not. An unknown slug and
  an unpublished one are the same 404, or the endpoint becomes an oracle for which links used
  to exist.
- **`/api/published/:slug` sits in the outer Fastify scope and the project routes in an
  encapsulated child**, which is what makes "public" structural: a `preHandler` added inside a
  child plugin cannot reach back out, so the public route cannot acquire an auth hook by
  someone moving a line. The client asks for it `anonymous` for the same reason.
- A published page gets no integration credentials at all (D14), so it runs its plain-URL
  queries and reports that its integration queries have no connection.
- The route is lazily loaded, so a visitor opening a share link does not download the builder.

### 12.3 Reusable components

A component the document owns, with a prop surface, placed on any page or inside another
component and edited in one place.

- **`ProjectDoc.symbols`** is document-scoped rather than page-scoped, because a component
  used on one page is a subtree and the thing worth building is the card that appears on four.
  An instance is a `Node` whose `type` is `symbol:<id>` — a namespaced registry key rather
  than a second field, so `getSpec` misses the whole namespace by construction.
- **`NodeTree` is what made it cheap.** A page and a symbol both satisfy `{ rootId, nodes }`,
  so every op is generic over it and the canvas, layers tree, drag controller and inspector
  edit a symbol through the code paths they already had. The studio hands every panel a _page
  view_ of whichever surface is open; the distinction lives in `resolveSurface` and in the one
  seam that commits an edit.
- **`symbolSpec` makes a symbol an ordinary `ComponentSpec`** (D7), so the palette lists it,
  search finds it and the Props tab generates its fields. `specFor(type, symbols)` is the one
  lookup every subsystem makes, bound to the open document so no panel can forget to pass the
  symbols and silently draw every instance as unknown.
- **No wrapper element.** An instance _is_ the element its symbol's root renders, wearing one
  extra class — its own, so the Design tab styles one placement. A wrapper would be a box in
  the middle of someone's flex row that exists only because the builder needed somewhere to
  hang an id, and it would have to exist in the export too.
- **A `Slot` is a hole, not a box.** It renders no element ever; the export emits `{children}`
  at that position. Its children are the fallback in React's own sense — codegen writes
  `{children ?? (…)}` — so a component dropped with no content looks like it looked while it
  was being built rather than collapsing to nothing. While the component is being authored the
  canvas draws the empty slot, and that drawing lives in `EMPTY_CONTAINER_CSS` rather than
  `COMPONENT_CSS`, which is the structural proof it can never reach an export.
- **A component sees its props and the theme, not `state` or `queries`.** One that read the
  page it happened to be dropped on would work on that page only, and the generated component
  has neither name in scope either, so an expression reaching for one fails the same way in
  both (D6).
- **Editing a component renders it against its own defaults**, seeded through
  `symbolDefaultProps` — a component whose contents you cannot see is one you cannot build,
  and it is the honest value, since it is what a placement that sets nothing would show.
- **"A component may not contain itself" belongs in the palette, not the drop resolver.** It
  is a fact about the whole surface rather than about a node, so the palette declines to offer
  it and the drag never starts.
- **Codegen writes one `src/components/<Name>.tsx` per symbol**, and a page emits
  `<ProductCard className={styles['ub-n-…']} title="Aurora" />`. An exported project that used
  a card four times contains one `Card`, not four copies — otherwise the export would be a
  worse codebase than the document it came from.
- Deleting a component takes its instances with it, and the panel says how many first.

### 12.4 Assets

`POST /api/projects/:id/assets` takes one file; the inspector's URL fields grow a picker.

- **The type check is the bytes, not the claim.** `lib/imageInfo.ts` reads the file's own
  header, and that one parse does both jobs — recognising the format _is_ the validation, and
  the same read hands back the dimensions. A declared `Content-Type` is a claim by whoever is
  uploading. SVG is excluded permanently: it is a document, it can carry script, and serving
  one from an origin that matters is serving script from that origin.
- **The bytes go first, then the row.** The other order leaves a row pointing at nothing every
  time an upload fails. This way a failure leaves an orphaned object, which costs storage and
  breaks nothing. Deleting is the mirror.
- **Nothing the client typed reaches the object store.** The key is
  `projects/<projectId>/<assetId>.<ext>`, the extension comes from what the bytes turned out to
  be, and the filename is dropped — it is attacker-controlled text and a key is a path.
- **A URL is stored in the document, not an asset id.** An id would be smaller, but the
  preview, the exported project and a shared link opened by someone with no account would each
  need a way to resolve one, and the export would ship pointing at this API rather than at the
  image. The cost is that deleting an asset cannot rewrite the nodes that used it, so the
  delete says so first.
- **Storage is optional.** D9's premise is that this repo needs no third-party keys, so a
  checkout with no bucket boots and works; the route answers 503 `unavailable` — nothing went
  wrong and retrying will not help — and the studio hides the button. Half-configured is
  refused at startup, which is the case that otherwise fails on the first upload someone tries.
- `app.storage` is a plugin decorator for the reason `app.db` is: it is the seam a test
  replaces.

### 12.5 Workspace API integrations (D14)

A workspace defines connections to outside HTTP APIs and the named calls on them; a page query
binds to one of those calls. `ApiIntegration` is the connection — base URL, auth scheme,
default headers, content type. `ApiEndpoint` is one call — method, path, headers, body, and
`resultPath`, the dotted path to where the rows live in a response. Endpoints are embedded in
their integration's summary, because every screen that lists connections wants their calls too.

D14 puts the call in the browser. The consequence is that whoever can open the studio can read
the workspace's tokens, and every third-party API has to send CORS headers of its own. What the
design still guarantees is narrower than a proxy and worth stating:

- The token is encrypted at rest (AES-256-GCM, `apps/api/src/lib/secrets.ts`), so a database
  dump is not a list of live credentials.
- It is served by its own route, behind its own role, and never appears in an integration's
  summary — so listing connections, which happens constantly, never puts one on the wire.
- It never enters a `ProjectDoc`, so revisions, publishes and exported zips cannot carry one,
  and rotating a token does not mean editing documents.
- A published page gets no credentials at all.

**One request builder, three callers.** `buildIntegrationRequest` lives in `schema` because the
API's test-run route, the browser at run time and the generator must not disagree about what a
request is. It is D6's argument applied to requests instead of CSS, and it takes its evaluator
as an argument, so `schema` still cannot evaluate anything (§10).

**Two template layers.** A page supplies `variables` whose values are templates in _page_
scope; the run time resolves page scope first, then the endpoint against those values.
**Codegen collapses them**, because an export has no catalogue to consult: `/users/{{ userId
}}` with `{ userId: '{{ state.id }}' }` is emitted as `/users/${text(state.id)}`. The generated
project contains no integration machinery at all, only an ordinary request, and the token
becomes `import.meta.env.VITE_<SLUG>_TOKEN` — named after the slug rather than the display
name, so renaming a connection does not rename a variable a deployment already sets.

**`querySourceTemplates` is the single place that knows which of a source's fields are
templates**, so the expression collector, the cycle detector and the rename warnings cannot
drift apart.

**A server-side test run** is the one place the API fetches a URL a user typed, and it exists
because the studio cannot offer "bind this column to `item.email`" without having seen a real
response. It carries a real SSRF guard — http/https only, no redirects, capped in time and
bytes, and refused against loopback, RFC 1918, link-local and the cloud metadata address unless
the deployment opts in. The residual DNS-rebinding window is recorded in `outbound.ts` rather
than left unsaid.

One note for whoever reads a request log: a cross-origin request carrying `Authorization` is
non-simple, so the browser sends a CORS preflight first. An `OPTIONS` line with no credential
on it is that, not a page firing before its token arrived.

### 12.6 Power BI (D15)

A page query can be a DAX statement against a Power BI semantic model — the third
`QuerySource` kind, and the first that is not an HTTP request somebody described: the URL, the
body and the shape of the answer are all the protocol's.

**Not an endpoint, deliberately.** A REST integration is a call defined once in workspace
settings that a page picks from a list. A Power BI query is written on the page, because the
DAX _is_ the query: there is no useful "define it once for the team" level between a dataset
and a statement. The connection supplies exactly two things — the base URL and the credential.

**D15 puts the client-credentials exchange on the server** (`apps/api/src/lib/oauth.ts`). What
reaches the browser is a minted access token that expires on its own — strictly **less** than
what the same role already gets from a `bearer` connection. Azure AD agrees: its v2 token
endpoint refuses `client_credentials` from a request carrying a browser `Origin`. There is no
refresh token on purpose: client credentials has no user to act for, so "refresh" is minting
another one, and a stored refresh token would be a second long-lived credential to protect for
nothing.

**The token cache** is one entry per connection, in process, holding a fingerprint of the
configuration it was minted for — the secret included, hashed rather than kept — so rotating a
secret invalidates it with nothing having to remember to. One in-flight promise per connection
means N simultaneous callers make one request. It is in memory rather than in the database
because it caches something re-derivable. `ApiIntegrationSecret.expiresAt` is null for every
scheme that cannot know, and the studio schedules a re-fetch a minute before the soonest one, so
a dashboard left open does not start failing an hour in. That renewal is deliberately not part
of the catalogue's key: gating on it would empty the catalogue for a round trip and every
integration query on the canvas would report having no connection, once an hour, for nothing.

**The one place a response is reshaped.** `executeQueries` answers with
`{ results: [{ tables: [{ rows }] }] }`, every column named the way DAX names things —
`Sales[Region]`, `[Total]`. Both facts are the protocol's rather than an author's: `resultPath`
exists to point through an envelope somebody _chose_, and nobody chose this one. `powerbiRows`
unwraps it and strips the qualifier, and it is total by construction — anything unexpected reads
as no rows rather than an error, because a DAX statement returning nothing is ordinary. Two
columns that would claim the same short name keep their qualified ones.

`schema/powerbi.ts` is therefore **written twice**, the second copy shipped into the export as
`src/lib/powerbi.ts`, pinned body-for-body by a test — the arrangement `values.ts` already uses,
with the same constraint: no backtick and no `${` in the module, because the other copy lives
inside a template literal.

**The export has no server**, so it cannot do the trade. It reads a bearer token from
`VITE_<SLUG>_TOKEN` like every other connection. Putting a client secret in a browser bundle so
the export could mint its own would hand every visitor a credential for the whole application —
the exact thing D15 exists to avoid.

### 12.7 Charts and cross-filtering

**One palette entry, nine shapes**, chosen from a `Shape` dropdown: bars, stacked bars, 100%
stacked bars, line, area, stacked areas, bars-with-a-line, pie and donut — with a `horizontal`
flag that lays the bar family on its side. That covers Power BI's whole bar/column/line/area/pie
family, which is fifteen entries in its visual gallery. Orientation is a flag rather than five
more kinds because horizontal bars are the same chart lying down; it applies to the bar family
alone, since a line read bottom-to-top is a line whose reader has to turn the page.

Nothing about the drawing is measured: it is an SVG `viewBox` scaled by CSS, so there is no
`ResizeObserver` and nothing waits for the canvas iframe to paint. The colours are six custom
properties in `css.ts` rather than values in the component, so a theme reaches them and a node
rule can override them.

**Colour encodes the series on a cartesian chart and the category on a round one.** A bar
chart's category axis already names every bar, so colouring by category would say a second time
what the axis says once and leave nothing for the dimming to mean; a single-series chart is
therefore one colour, the theme's primary. Parts of a whole have no axis, so there the marks
genuinely have nothing else telling them apart.

**`palette` is the first prop whose value is a list**, which is why it is a prop type rather
than a colour field with a flag: a rule could set six custom properties but could not say
"these two, and the rest as the theme had them". A named list replaces the **front** of the
component's own and leaves the tail alone; a longer list lengthens the cycle. It is held as one
comma-separated string so the document, a binding and the emitted attribute stay what they
were, and `splitPalette` splits on the commas _between_ colours, so `rgb(37, 99, 235)` is one
colour and `var(--brand, #eee)` survives. The control shows the **whole** cycle — named slots
solid and openable, the rest dashed previews of the component's own list, delivered through
`PropSpec.swatches` so the Props tab holds no per-component code (D7). Clicking a preview
**extends** the named list to there and clearing a well **shortens** it to before there; neither
can leave a hole, because a hole is not something a comma-separated value could hold.

**Many series**, each handled in one place rather than once per shape:

- **Both shapes a query answers in.** Several named `Value fields` is one column per series
  (`Jan | North | South`); one `Series field` is one column whose _contents_ are the series
  (`Jan | North | 10`), which is what `SUMMARIZECOLUMNS` gives. With neither named, every
  numeric column is a series and the first column that is not one is the axis — so a
  two-measure DAX result draws both halves before anything is configured.
- **Every series holds every category**, missing ones as zero: a stack needs the segment below
  it and a cluster the slot beside it, and neither can be found by index if two series disagree
  about how many points they have. Rows landing in one slot are added up.
- **One `from` and one `to` per mark.** Clustered, stacked and 100% stacked differ only in what
  spans the value axis, so `spansOf` is the whole of the difference and every renderer below it
  draws a span without knowing which it is drawing. That is why turning the bars sideways did
  not have to be written again for each, and why negatives stack _downward_ from zero.
- Marks are ordered areas, bars, lines, dots, or a combo chart draws its line under its own
  bars. Only a cluster moves its series across the band; a stack separates them along the value
  axis instead.
- There is **one value axis**, including for the combo chart. A second can be scaled to put any
  line above any bar, which is a way to draw a relationship that is not in the numbers.

**The cross-filter** is `onSelect` plus one action step. Because a DAX statement is template
source in page scope, writing a value into state re-runs every query reading it, so clicking a
bar needs no query machinery — only somewhere for the click to put the value. Three things had
to exist for that "only":

- **An event that carries a value.** `onSelect` is called with the mark, not a `MouseEvent`, so
  `{{ event.label }}` is a handler someone can write. That is free on the canvas and would not
  compile in the export, where the generator types a handler's parameter from the element it
  landed on — so `ComponentSpec.eventPayloads` is how the registry says what it passes (D7),
  written as a structural type so the generated page imports nothing.
- **A prop that is not narrowed.** `as: 'data'` in a template and `type: 'data'` in a spec are
  the same decision on the two sides of D6: the component takes `unknown` and decides for itself
  whether it got an array or typed text. This turned out to be a pre-existing bug rather than a
  new requirement — `coerceToProp` was JSON-encoding any array bound to a `text` prop, so a
  `Table` or `Select` bound to a query rendered as its own payload on the canvas and correctly
  in the export.
- **`setFilter`**, the step whose second application is a clear. It is `setState` except that
  writing what the variable already holds clears it, which is what makes a filter undoable by
  clicking the same mark again — the alternative being `{{ state.region === event.label ? '' :
event.label }}` rewritten in every handler on every chart. Clearing is the empty string
  whatever the variable's declared type, because a category is text.

The chart is handed the category back as `selected` and dims everything that is not it. A click
that filters the page and leaves the chart looking exactly as it did is a click the reader
cannot tell landed, or tell how to undo.

**The one thing that could not be kept, and is said out loud instead.** A step cannot see a
write made beside it (§10), and the generated handler is the same, because `queries.x.run()`
sends the request _this_ render built. So filtering and then running a query sends the previous
filter: the page fetches and the numbers are one click stale. The remedy is to delete the step,
since a query that runs on load re-sends itself whenever its request changes — which is the
whole reason a filter bar needs no wiring. `staleQueryWarnings` says that at export time, on
`setFilter` only and not on `setState`, where the author's own value is being written and the
ordering can be compensated for in the request.

### 12.8 Workspaces, roles and members

Roles are a capability table (`hasAtLeast`/`REQUIRES` in `packages/schema`) rather than inline
comparisons, so a route declares _what it needs_ and never _who may do it_, and the studio can
hide what the API would refuse. The server is still the enforcer.

`MembersDialog` offers exactly what the server would allow and nothing more, asking the two
permissions separately the way the service does: changing a role needs workspace management
_and_ outranking the target, so an admin cannot promote anyone past themselves and an owner's
own row has no select; removing needs one or the other, because acting on yourself is always
allowed — which is what makes "leave this workspace" the same control rather than a second one.
Roles the viewer does not outrank are shown disabled rather than omitted, so the ceiling is
visible instead of mysterious. It is open to every member, because a viewer needs to know who to
ask for access and leaving is something nobody should need help with.

Three consequences that were paid for:

- **A member mutation invalidates the workspace _list_, not just the member list.** A workspace
  summary carries the caller's role, and that is what every screen reads to decide what to
  offer. Demoting yourself and leaving the project grid showing **New project** is a button
  that 403s.
- **The invalidation must be awaited before the "where do I go now" callback runs**, or
  navigating to `/` while the cached list still holds the workspace sends the leaver straight
  back into it.
- **Leaving unmounts the component that asked for it**, so the redirect is a hook-level option
  rather than a per-call callback; and a leaver must not refetch the member list, which has
  stopped being readable.

### 12.9 Deployment and CI

`.github/workflows/ci.yml` runs format, lint, typecheck and the production build on every push
to `main` and every pull request, against a `postgres:17` service container. One job rather than
a matrix: every check needs the generated Prisma client, so sharding would repeat `npm ci` and
`prisma generate` to save less time than that setup costs. `apps/api/.env` is absent on a
runner, so every variable `env.ts` validates arrives from the workflow's `env:` block.

`compose.yaml` and `deploy/` are the production path: Caddy in front, the API and studio behind
it, `deploy/backup.sh` pushing database backups off the instance to S3. Caddy sets HSTS,
`nosniff` and `Referrer-Policy`, and no-cache on `index.html` for **every** SPA path rather than
`/` alone — deep links (`/projects/<id>`, `/published/<slug>`) are served the same file. Fastify
sets `trustProxy`, since everything arrives through Caddy and `request.ip` would otherwise be
the docker bridge address for every caller — which would also put the whole internet in one
rate-limit bucket. `/health` answers with a fixed string; the reason goes to the log, because
`/health` is proxied unauthenticated and a Postgres error names the host, port and role.

---

## 13. Invariants and risks

| Risk                                              | What holds it                                                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas ≠ exported code                            | D6 at three seams (§11): one style serializer, one registry, and twin-file tests for the code that cannot be shared.                            |
| React across the iframe realm                     | Two independent roots and one shared store. Never portal across realms; never `instanceof` a canvas node.                                       |
| Zoom breaking overlay alignment                   | A single `toStudioSpace()`; an overlay never reads a rect directly.                                                                             |
| The inspector silently not working on a component | The one-class rule in `css.ts`, enforced by `css.test.ts`, plus the `em` rule for inheritable properties (§7).                                  |
| Doc schema churn breaking saved projects          | `schemaVersion` + `migrateDoc` on every read; migrations are pure, tested against fixtures, and keep a document openable (§3).                  |
| Expression footguns (XSS, a crashed canvas)       | `new Function` exists in `packages/runtime` only, inside the iframe; `schema` takes its evaluator as an argument; per-node boundaries.          |
| Concurrent edits losing work                      | `baseVersion` + a conditional update; a 409 is a dialog, not a merge (§12.1).                                                                   |
| A credential reaching somewhere it should not     | Encrypted at rest, served by its own route, never in a document, never on a published page; the one exchange that must be server-side is D15.   |
| The API gaining a browser                         | `apps/api/tsconfig.json` has no DOM lib and `no-restricted-globals` is the backstop; the spec/implementation split is what keeps that possible. |
| Scope creep into "the whole of Plasmic"           | §15 is the parking lot, and each entry says what it is waiting on.                                                                              |

---

## 14. How the work is checked

The gates are `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run build`.
Typecheck is the main correctness gate.

**The Vitest suite is switched off at the root and stays off**: the root config has an empty
`include` with `passWithNoTests`, and CI does not run a test step. The `*.test.ts` files are all
still on disk, still pass, and each workspace keeps its own config, so an individual file can be
run while debugging:

```bash
npx vitest run --config packages/codegen/vitest.config.ts src/page.test.ts
npx vitest run --config packages/schema/vitest.config.ts -t 'migrates'
```

What those files cover, and why each kind exists:

- **Unit** — `ops` tree operations, `style` and `cascade` serialization, `expr` parsing,
  the SSRF address ranges, the image header parser, the coercions.
- **Twin-file** — `runtime.test.ts`, `values.test.ts`, `Chart.test.ts`, the `powerbi` pair.
  These are the only thing that would notice a copy drifting from its original.
- **Snapshot** — `codegen` against fixture documents. Byte-stability is the contract: an
  unchanged document exports identically, which is why nothing in that package may read a file,
  open a socket or look at the clock.
- **Integration** — the API against a live Postgres (`TEST_DATABASE_URL`), serially, with a
  raised timeout for argon2. Tables are truncated from `pg_tables` rather than a hand-listed
  set, so a new model cannot silently leak rows.

**A snapshot only proves the bytes did not move.** Proving a codegen change means three checks,
and the third is where the real bugs have been:

```bash
npx tsx packages/codegen/scripts/emit.mts <out-dir> [--doc demo|interactive|symbols|slots|powerbi]
cd <out-dir> && npm install && npm run build     # the export's own tsc, under strict
```

then drive the built bundle in a browser against a mocked API. A `.map()` emitted one paren
short, a page referencing a name it never declared, a JSX attribute carrying a raw newline, a
stacked chart stepping sideways and a combo chart drawing its line under its bars were all
invisible to a snapshot and to a type-check respectively. Playwright is not a dependency — it
lives in the npx cache — so browser passes are hand-run.

**The fidelity diff, when it is worth redoing.** Emit a fixture, build it, serve it with `vite
preview`; render the oracle by calling `renderToStaticMarkup(PageRenderer({ page, theme }))`
from a script under `packages/runtime` into the same `<div id="root">` shell; screenshot both
and diff them by drawing the two PNGs onto a canvas in the browser. Last run: the DOM matched
tag for tag, and 46 of 786,432 pixels differed — one animation dot caught mid-cycle.

---

## 15. Open work

Each entry says what it is waiting on, because most of these are blocked on a decision rather
than on typing.

**Components**

- `Icon` needs the `icon` PropSpec type and a picker, which waits on choosing the icon set —
  a bundle-size decision, not an inspector one. `Form` wants an `onSubmit` to carry. `List` is a
  `repeat` wearing a component's name.
- **Component variants** — a variant is a prop whose value picks a subtree. Now that slots
  exist, this is the next symbol feature.
- **The rest of the Power BI gallery.** Scatter, bubble, treemap, funnel, waterfall and ribbon
  are further shapes over the same series model and the same `onSelect`. `KPI`, `Gauge` and
  `Matrix` are not — none of them is a category axis against a value axis.
- **A second value axis** for the combo chart: deliberately not built, see §12.7.

**Data**

- **Pagination.** `resultPath` finds the rows; nothing yet carries a cursor into the next
  request. It wants a `runQuery` step that can pass arguments — which is the same feature the
  stale-filter ordering in §12.7 is waiting on.
- **A bound source on the remaining transforms.** `radios`, `navItems` and `tabs` are the same
  shape as `options` and would take the same treatment. `markdown` is the one to leave alone.
- **Dataset and workspace pickers** for Power BI: both ids are typed in, and a `groups`/
  `datasets` lookup would make the panel two dropdowns rather than two GUIDs someone pastes.
- **Rotating a token** invalidates nothing in a running studio for the four schemes whose
  credential is pasted in — a session holds the old value until it reloads. Closed for `oauth2`,
  which is the only one that knows when its credential dies.

**Studio**

- **Realtime multiplayer (Yjs).** D3 and D10 keep the door open; nothing else is waiting on it.
- **Device presets and breakpoint chips both want to own the artboard's width.** The presets are
  plain data in `apps/web/src/preview/devices.ts` and pointing a second control at
  `artboardWidth` is a few lines, but it needs a decision about what the two controls mean
  together.

**Export**

- **Tailwind and shadcn emitters.** D8 makes both additive; the shadcn one is mostly a rename,
  since D13 kept the props 1:1.
