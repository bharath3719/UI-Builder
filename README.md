# UI Builder

A visual builder for real React applications. Drag components onto a zoomable canvas, style
them against a theme, give the page state and live data, preview it at phone and laptop
sizes, publish it to a link — and export a React project that does exactly what the canvas
did.

---

## What makes it different

**The canvas and the exported code cannot drift apart.** One style serializer produces the
CSS for both. One component spec produces the markup for both. The three pieces of code that
genuinely cannot be shared — an export ships to a stranger and cannot import this repo — are
written twice and pinned together by tests that run both copies over the same inputs. The
last pixel-diff of a canvas page against its built export: the DOM matched tag for tag, and
46 of 786,432 pixels differed, all of them one animation dot caught mid-cycle.

**The export is a codebase, not a runtime.** No interpreter ships with it, and no document is
embedded in it. Your state becomes `useState`, your queries become hooks, your event lists
become named handlers, a repeat becomes `.map()`, a condition becomes `&&`, and a component
you built four times becomes one component imported four times. It builds under `strict` with
`noUnusedLocals`, and `npm install && npm run dev` is all it needs.

**The expressions you type are kept verbatim.** A prop's binding is stored as the template
source you wrote — `Hello {{ state.name }}` — so it round-trips back into the field it was
typed in, and the canvas and the export evaluate the same string. Nothing rewrites your code
behind your back.

**Your styles always win.** Every selector in the component library weighs exactly one class,
with no `!important` anywhere, so the rules the inspector writes for a node always beat the
library's defaults. A component never sets an inline style from a prop. Tests fail the build
on a rule that breaks this.

**Data is a first-class part of the page, not a plugin.** Page state and HTTP queries live in
the left rail; a workspace can define shared API connections once and every project binds to
them; a query can be a DAX statement against a Power BI semantic model; a chart can filter the
page it is drawn on. All of it exports — the generated project makes ordinary `fetch` calls
with the tokens supplied as environment variables.

**Charts that cover a real BI gallery.** One palette entry, nine shapes — bars, stacked, 100%
stacked, line, area, stacked areas, combo, pie, donut — in either orientation, with multiple
series detected from whatever shape your query answers in, and a click on a mark that filters
every query reading that variable.

**It runs with no third-party keys.** Own auth, local Postgres. Object storage, API
connections and OAuth are each optional: without them the app boots, works, and hides the
buttons it cannot back.

---

## What it does

**Workspaces and projects** — sign up, create a workspace, invite people by email with
OWNER / ADMIN / EDITOR / VIEWER roles, create and archive projects. The studio only ever
offers what the server would allow, and the server is still the enforcer.

**The canvas** — a real `<iframe>`, so the design's CSS is perfectly isolated from the tool's.
Pan and zoom by wheel, trackpad pinch, space-drag, middle-drag or the toolbar. Drag from the
palette or the layers tree; drop indicators say where a node will land and what it will land
next to. Select with click, Ctrl/⌘-click, Shift-range, ⌘A or a rubber band, then edit the
whole selection at once.

**46 components** across Layout, Basic, Form, Data, Media, AI and Overlay — shadcn's design
and prop vocabulary on plain CSS. Stacks, grids, page chrome, text and Markdown, the full form
row, tables, charts, cards, chat and agent-transcript components, modals, drawers, tabs,
accordions and tooltips.

**Styling** — a Design tab over the box model, typography, background, border, effects and
position, with responsive breakpoints and hover/focus/active/disabled states. Every field is
token-aware, shows where an inherited value came from, and marks what you have overridden.
Edits write to the whole selection and say `Mixed` where its members disagree.

**Your own components** — turn a selection into a component, give it typed props, drop a
`Slot` where a placement's content goes. Place it anywhere, configure and style each placement
separately, edit the component once and every placement follows.

**Interactions** — per-event action lists: set or toggle state, set a filter, run a query,
navigate, show a toast, open or close an overlay. Any prop can be bound to a `{{ expression }}`
with completion over what is in scope, and any node can repeat over a list or hide behind a
condition.

**Live data** — page state variables and HTTP queries with templated URLs, headers and bodies;
workspace-level API connections with named endpoints, sampled responses and encrypted tokens;
Power BI queries written as DAX. Bind a table's columns, a dropdown's options or a chart's
series straight to a result.

**Preview and publish** — the page on its own at mobile, tablet and laptop sizes, in a real
viewport so its own media queries resolve correctly. Publish a snapshot to a link anyone can
open without an account; the link keeps showing what you published until you update it.

**Saving** — autosave with an optimistic version check, 500 steps of undo/redo, and a version
history you can name and restore. Two tabs editing the same project get a conflict dialog, not
a silent overwrite.

**Export** — the Code button shows the project your design compiles to and downloads it as a
zip; `GET /api/projects/:id/export` streams the same bytes for CI.

---

## Requirements

|            |                     |
| ---------- | ------------------- |
| Node       | 22+                 |
| npm        | 10+ (workspaces)    |
| PostgreSQL | 14+ running locally |

## Setup

```bash
npm install

cp apps/api/.env.example apps/api/.env      # then fill in DATABASE_URL and JWT_SECRET
npm run db:create                            # creates the database named in DATABASE_URL
npm run db:generate                          # generates the Prisma client

npm run dev
```

- Studio — <http://localhost:5173>
- API — <http://localhost:3000>, health at <http://localhost:3000/health>

The studio proxies `/api` and `/health` to the API, so the browser only ever talks to one
origin in development.

> Vite binds to `localhost`, which resolves to IPv6 `::1` on Windows. Use `localhost:5173`
> rather than `127.0.0.1:5173`.

## Scripts

Run from the repo root.

| Script                | Does                                                   |
| --------------------- | ------------------------------------------------------ |
| `npm run dev`         | Starts the API and the studio together                 |
| `npm run build`       | Builds every workspace                                 |
| `npm run typecheck`   | Typechecks every workspace — the main correctness gate |
| `npm run lint`        | ESLint across the repo                                 |
| `npm run format`      | Prettier write (`format:check` is what CI runs)        |
| `npm run db:create`   | Creates the database if it does not exist              |
| `npm run db:generate` | Regenerates the Prisma client                          |
| `npm run db:migrate`  | Creates and applies a migration                        |
| `npm run db:studio`   | Opens Prisma Studio                                    |

CI runs format, lint, typecheck and build. The Vitest suite is switched off at the root; the
test files are still on disk and each workspace keeps its own config — see PLAN.md §14.

## Layout

```
apps/
  web/        Vite + React studio — rail, palette, canvas, inspector
  api/        Fastify + Prisma — auth, workspaces, projects, revisions,
              publishing, assets, integrations, export
packages/
  schema/     The contract: doc model, zod validators, ops, style serializer
  components/ The built-in library and its registry — one spec per component.
              `.` is spec data; `./react` is the implementations
  runtime/    Renders a page to real DOM; shared by canvas, preview and export
  codegen/    A document to a runnable React project, as files in memory
  tsconfig/   Shared TypeScript bases
deploy/       Caddy, backups; compose.yaml at the root
```

**Dependency direction — never violate this:**

```
schema <- components        <- codegen <- web / api
schema <- components/react  <- runtime <- web
schema <- api
```

`packages/schema` imports nothing from this repo. It is the only thing both sides agree on,
and it is what keeps the canvas and the exported code from drifting apart (PLAN.md D6).

Workspace packages ship TypeScript source rather than build output — Vite and `tsx` consume
it directly, so `npm run dev` never needs a build-the-dependencies step. Only the API is
bundled (tsup) for production.

---

[PLAN.md](PLAN.md) is the architecture record — the decisions, why each was taken, and what it
would cost to change. [CLAUDE.md](CLAUDE.md) is the short working brief for the conventions a
change has to respect.
