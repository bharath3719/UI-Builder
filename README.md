# UI Builder

A visual UI builder: workspaces and projects, a drag-and-drop zoomable canvas, a
searchable component palette, a properties inspector, live preview, and React code
export.

See [PLAN.md](PLAN.md) for the architecture and the phase plan. **Current state: Phases
0–2, 4 and 7–11 done, and a working slice of 3, 5 and 6 — you can sign up, create a
workspace and a project, open the editor, build a nested layout by dragging components
from the palette onto the canvas, pan and zoom it, and style anything you select — one
node or several, picked with Ctrl/⌘-click, a Shift-range in the layers tree or a rubber
band across the canvas. The Design tab writes to the whole selection and says `Mixed`
where its members disagree. Styling covers responsive breakpoints, hover and focus
states, the box model, typography and the theme's colours. Everything autosaves,
undo/redo goes back 500 steps, and a version history lets you name a version and restore
one. Preview shows the page on its own at mobile, tablet and laptop sizes, and can
publish it to a link anyone can open without an account. A page can hold state variables
and HTTP queries (the Data panel in the left rail), any prop can be bound to a
`{{ expression }}` with completion over what is in scope, and a node can repeat over a
list, hide behind a condition, or run a list of actions on an event. The Code button shows
the React project your design compiles to and downloads it as a zip that runs with `npm i
&& npm run dev` — state as `useState`, each query as a hook whose request interpolates the
page, each event as a named handler, a repeat as a `.map()` and a condition as an `&&`, so
what you built on the canvas is what the exported project does. Next is Phase 12: reusable
components, assets, and multiplayer.**

## Requirements

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| Node       | 22+ (`node --watch` and the built-in test runner are relied on) |
| npm        | 10+ (workspaces)                                                |
| PostgreSQL | 14+ running locally                                             |

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

The studio proxies `/api` and `/health` to the API, so the browser only ever talks
to one origin in development.

> Vite binds to `localhost`, which resolves to IPv6 `::1` on Windows. Use
> `localhost:5173` rather than `127.0.0.1:5173`.

## Scripts

Run from the repo root.

| Script                | Does                                      |
| --------------------- | ----------------------------------------- |
| `npm run dev`         | Starts the API and the studio together    |
| `npm run build`       | Builds every workspace                    |
| `npm test`            | Runs all tests (Vitest, all workspaces)   |
| `npm run typecheck`   | Typechecks every workspace                |
| `npm run lint`        | ESLint across the repo                    |
| `npm run format`      | Prettier write                            |
| `npm run db:create`   | Creates the database if it does not exist |
| `npm run db:generate` | Regenerates the Prisma client             |
| `npm run db:migrate`  | Creates and applies a migration           |
| `npm run db:studio`   | Opens Prisma Studio                       |

## Layout

```
apps/
  web/        Vite + React studio — rail, palette, canvas, inspector
  api/        Fastify + Prisma — auth, workspaces, projects, revisions
packages/
  schema/     The contract: doc model, zod validators, style serializer
  components/ The built-in library and its registry — one spec per component.
              `.` is the spec data; `./react` is the implementations
  runtime/    Renders a page to real DOM; shared by canvas, preview and export
  codegen/    A document to a runnable React project, as files in memory.
              `src/export/` is the compiled twin of a file the export ships
  tsconfig/   Shared TypeScript bases
```

**Dependency direction — never violate this:**

```
schema <- components        <- codegen <- web / api
schema <- components/react  <- runtime <- web
schema <- api
```

`codegen` reads the registry for the same reason the palette and the inspector do: a
component's markup, like its props panel, is declared once on its spec (D7).

**A spec is data; a component is React, and the two are separate entry points.**
`@ui-builder/components` is specs, the registry, the library stylesheet and the Markdown
parser — no React, no lucide, no DOM. `@ui-builder/components/react` is the 31
implementations and the palette's icons, joined back to a spec by `key`. That is what
lets the API read every `emit` template without React in its bundle, and it is why the
API's tsconfig is a plain Node one. Importing the React half from server code is now a
visible act rather than something a transitive import does for you.

`packages/schema` depends on nothing. It is the only thing both sides agree on, and
it is what keeps the canvas and the exported code from drifting apart (PLAN.md D6).

Workspace packages ship TypeScript source rather than build output — Vite and `tsx`
both consume it directly, so `npm run dev` never needs a build-the-dependencies step.
The API is bundled with tsup for production.

## Conventions

- **Studio styling** is CSS Modules over the tokens in
  `apps/web/src/styles/tokens.css`. Never hard-code a colour, radius or spacing
  value in a component — add or use a token. Tailwind is deliberately not used, so
  there is no ambiguity between studio styles and the CSS the builder generates for
  the user. The design rules are PLAN.md §8.
- **The document model** lives in `packages/schema` and nowhere else.
- **The component library's CSS weighs exactly one class.** Every selector in
  `packages/components/src/css.ts` is a single class, with any `[data-*]` wrapped in
  `:where()` and no `!important` anywhere, so the per-node rules the inspector writes
  always win on source order. A rule that out-specifies `.ub-n-<id>` makes the Design
  tab silently stop working for that component; `css.test.ts` fails the build on one.
  For the same reason a component never sets a style prop inline from a prop — it
  renders a `data-*` attribute and the sheet matches it.
- **The export is one pure function, called from two places.** `projectArchive` in
  `packages/codegen` turns a document into a zip with no I/O, no clock and no formatter,
  so the studio's download button and `GET /api/projects/:id/export` cannot produce
  different bytes. Nothing in that package may read a file, open a socket or look at the
  time — a timestamp in the archive alone would break the test that asserts an unchanged
  document exports identically.
- **A component's exported markup is declared on its spec, not in the generator.**
  `codegen` reads the `emit` template in `specs/Button.ts` the same way the palette reads
  its icon and the inspector reads its props (D7). A spec without a template fails
  `page.test.ts`. Adding one is four edits: `specs/<Name>.ts`, `react/<Name>.tsx`, a line
  in `SPECS`, and a line in `COMPONENTS` — `implementations.test.ts` fails the build if
  the last is forgotten. The exception is a component whose shape depends on what was
  typed rather than on which props were set: `Select`, `Radio`, the three nav components,
  `RichText` and `Table` each name a transform (`options`, `radios`, `navItems`,
  `markdown`, `tableHead`/`tableRows`) that `@ui-builder/codegen` owns the one
  implementation of. Reach for one only when a static template genuinely cannot say it.
- **An export is markup, with one narrow exception.** A component whose behaviour cannot be
  written as a static tree — `Table`, whose rows can be dragged into a new order — names an
  `EmitModule` in `packages/components/src/runtime.ts`, and the generator ships that file
  into `src/components/` and imports it. Such a module must be a _wrapper_: it takes the
  markup the template already produced as its children and adds behaviour, never markup of
  its own, so the canvas and the export still render the same elements (D6). Its React twin
  lives in `react/` under the same name and `runtime.test.ts` asserts the two are the same
  code from the first import down. A spec that ships one also sets `interactive: true`, so
  the renderer freezes it on the canvas the way it freezes a form control.
- **A page's own behaviour is generated; what every page shares is shipped.** State,
  requests and event handlers are written into the page as readable code naming the
  author's own variables — `useState`, a `useQuery` call, a named handler per event. The
  four files in `src/lib/` are the part that would be identical in every project, and each
  lands only in a project that reaches for it. `src/lib/values.ts` is the one that matters:
  it is the export's copy of `stringifyValue`, `isTruthy` and `asEnum`, it has to be a copy
  because an export cannot import this repo, and `values.test.ts` runs both copies over the
  same values so they cannot drift. Nothing rewrites an expression the author typed — the
  generated component defines `state`, `queries`, `item` and `index` around it instead.
- **Access tokens are held in memory only**, never in `localStorage`. The httpOnly
  refresh cookie is what survives a reload, so a page load has no session until
  `POST /api/auth/refresh` answers. That is why `useAuth().user` has three states —
  `undefined` (still asking), `null` (signed out), and the user.
- **Role checks are shared.** `hasAtLeast` and `REQUIRES` live in `packages/schema`
  so the studio hides what the API would refuse. The server is still the enforcer;
  the client only decides what to offer.
- **The document is edited as a value, never mutated.** Every change goes through a
  pure `schema/ops` function, so the undo stack is an array of documents rather than a
  diff, and "is anything unsaved?" is a `!==`. Nothing outside
  `StudioProvider`'s `editDoc` may write to it — that is the one place a history step
  is recorded, and a call site that bypassed it would edit without one.
- **A stored document is migrated before anything reads it.** `migrateDoc` runs on
  every server-side read; a change to the document types is a two-step edit — change
  them, then add the migration keyed on the version it upgrades from.
- **Saves carry `baseVersion` and may be refused.** The API bumps `Project.version` with
  a conditional update, so a stale save is a 409 rather than a silent overwrite. The
  studio stops autosaving and asks which side to keep.
