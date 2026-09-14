# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A visual UI builder: workspaces and projects, a drag-and-drop zoomable canvas, a component
palette, a properties inspector, live preview, and React code export. `README.md` has the
current feature state; `PLAN.md` is the architecture record — its numbered decisions
(D1–D15) and sections (§2, §3, §7, §8, §10, §12) are cited throughout the source, so when a
comment says "PLAN.md §7" that section is the rationale.

## Commands

Run from the repo root.

| Command               | Does                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `npm run dev`         | API (:3000) + studio (:5173) together via concurrently           |
| `npm run build`       | Every workspace                                                  |
| `npm run typecheck`   | `tsc --noEmit` in every workspace — the main correctness gate    |
| `npm run lint`        | ESLint across the repo                                           |
| `npm run format`      | Prettier write (`format:check` is what CI runs)                  |
| `npm run db:create`   | Creates the database named in `DATABASE_URL`                     |
| `npm run db:generate` | Regenerates the Prisma client — needed before typecheck or build |
| `npm run db:migrate`  | Creates and applies a migration                                  |

Setup is `npm install`, then `cp apps/api/.env.example apps/api/.env` (fill in
`DATABASE_URL` and `JWT_SECRET`), then `db:create` and `db:generate`. Node 22+, npm 10+,
Postgres 14+ running locally — no Docker.

Vite binds to `localhost`, which is IPv6 `::1` on Windows. Use `localhost:5173`, not
`127.0.0.1:5173`.

### Tests

**The suite is switched off and stays off.** `vitest.config.ts` at the root has an empty
`include` with `passWithNoTests`, and the CI workflow's test step is removed — CI runs
format, lint, typecheck, build. The `*.test.ts` files are all still on disk and still pass;
they are just not collected.

Do not write new test cases as part of a change. If you need to run an existing file while
debugging, each workspace keeps its own config, so:

```bash
npx vitest run --config packages/codegen/vitest.config.ts src/page.test.ts
npx vitest run --config packages/schema/vitest.config.ts -t 'migrates'
```

The API's config needs a live Postgres (`TEST_DATABASE_URL`), runs files serially, and
raises the timeout for argon2.

### Proving a codegen change

Snapshots only prove the bytes did not move. To prove the output compiles and runs:

```bash
npx tsx packages/codegen/scripts/emit.mts <out-dir> [--doc demo|interactive|symbols|slots|powerbi]
cd <out-dir> && npm install && npm run build      # the export's own tsc is the real check
```

`emit.mts` deletes the output directory first, so re-emitting wipes the `node_modules` you
just installed. `--doc powerbi` is the only fixture that also needs connections passed to
`generateProject`.

## Architecture

```
apps/web/    Vite + React studio — rail, palette, canvas, inspector
apps/api/    Fastify + Prisma — auth, workspaces, projects, revisions, assets, integrations
packages/schema/      The contract: doc model, zod validators, ops, style serializer
packages/components/  Built-in library + registry. `.` is spec data; `./react` is React
packages/runtime/     Renders a page to real DOM; shared by canvas, preview and export
packages/codegen/     Document -> a runnable React project, as files in memory
packages/tsconfig/    Shared TS bases
```

**Dependency direction — never violate:**

```
schema <- components        <- codegen <- web / api
schema <- components/react  <- runtime <- web
schema <- api
```

`packages/schema` imports nothing from this repo. It is the only thing both sides agree on,
and it is what stops the canvas and the exported code from drifting (D6).

Workspace packages ship TypeScript source, not build output — Vite and `tsx` consume it
directly, so `npm run dev` never needs a build-the-dependencies step. Only the API is
bundled (tsup) for production.

### The four load-bearing ideas

**1. One spec per component feeds every subsystem (D7).** `packages/components/src/spec.ts`
defines `ComponentSpec`; the palette reads `icon`/`category`/`keywords`, the inspector
generates controls from `props`, drag-and-drop consults `acceptsChildren`, the renderer
mounts the implementation keyed by `key`, and codegen reads `codegen.emit`. Adding a
component is four edits: `specs/<Name>.ts`, `react/<Name>.tsx`, a line in `SPECS`, a line
in `COMPONENTS`. A spec with no `emit` template fails `page.test.ts`.

A spec is **data**: no React, no lucide, no DOM. That is why `icon` is a string name rather
than a component, and why the API can read the whole registry without React in its bundle.
The React half is a separate entry point (`@ui-builder/components/react`), joined back by
`key`.

**2. The document is edited as a value, never mutated.** Every change goes through a pure
function in `packages/schema/src/ops.ts`, so undo/redo is an array of documents and "is
anything unsaved?" is a `!==`. Nothing outside `StudioProvider`'s `editDoc`
(`apps/web/src/studio/state/`) may write to the document — that is the one place a history
step is recorded. The node map is flat (`Record<NodeId, Node>` + `children: NodeId[]`), not
a nested tree (D3). State lives in React context, not Zustand (D11) — there is no Zustand
in the repo.

**3. A stored document is migrated before anything reads it.** `migrateDoc` runs on every
server-side read. Changing the document types is a two-step edit: change them, then add a
migration in `packages/schema/src/migrate.ts` keyed on the version it upgrades _from_, and
bump `DOC_SCHEMA_VERSION` in `doc.ts`. (Note `SCHEMA_VERSION` in `version.ts` is a
different, unrelated constant.)

**4. The export is one pure function called from two places.** `projectArchive` in
`packages/codegen` turns a document into a zip with no I/O, no clock and no formatter, so
the studio's download button and `GET /api/projects/:id/export` cannot produce different
bytes. Nothing in that package may read a file, open a socket or look at the time — a
timestamp in the archive alone breaks the "unchanged document exports identically" test.

### Canvas (the hard part, PLAN.md §5)

The canvas renders inside an `<iframe>` (D2) for total CSS isolation — two React roots, one
store passed through `contentWindow`. Overlays (selection box, drop indicator, resize
handles) live in the **parent**, never in the iframe, so the user's DOM stays clean. All
rect math goes through one `toStudioSpace` helper — inlining
`elRect * zoom + iframeOffset` is where zoom bugs come from. Hit-testing is
`elementsFromPoint(x/z, y/z)` walking up to the nearest `data-node-id`.

Drag-and-drop is custom pointer events (D5), not HTML5 DnD and not dnd-kit, because HTML5
DnD does not cross the iframe boundary. Drop resolution lives in
`apps/web/src/studio/canvas/resolveDrop.ts` and `studio/dnd/`.

### Twin files that must stay in sync

Three places keep a second copy of code that ships to the export, each guarded by a test
that fails when the copies differ:

- `packages/components/src/react/<Name>.tsx` ↔ its template literal in
  `components/src/runtime.ts` (`runtime.test.ts`). Inside the literal a backslash must be
  doubled — a single `\n` becomes a real newline in the shipped string.
- `packages/codegen/src/lib.ts` (template literal source of the emitted `src/lib/values.ts`)
  ↔ `packages/codegen/src/export/values.ts` (`values.test.ts`). No backtick or `${` may
  appear in that module source — it would terminate the enclosing literal.
- `stringifyValue` / `isTruthy` / `asEnum` exist in both `schema` and the export's copy,
  because an export cannot import this repo.

Editing one side of a pair without the other is the failure mode here.

**Do not hand-edit both copies — derive one from the other.** Editing the `.tsx` twice over
walks into two traps in turn, and the chart legend fix (punch-list item 11) hit both:
prettier formats the `.tsx` but cannot see inside a template literal, so a reformat
desynchronises the pair; and copying the file through verbatim turns every `\n` in it into a
real newline, which leaves a file that still compiles and silently stops splitting on
anything. The reliable shape is: edit `react/<Name>.tsx`, run prettier on it, then
regenerate the literal from the formatted file — take everything from its first `import`
onward, double the backslashes, and splice it in between `source: \`` and the closing
backtick, keeping the literal's own header comment. Then run `runtime.test.ts`, which is
what proves it.

## Conventions

- **Studio styling is CSS Modules over the tokens in `apps/web/src/styles/tokens.css`.**
  Never hard-code a colour, radius or spacing value — add or use a token. Tailwind is
  deliberately absent so there is no ambiguity between studio styles and the CSS the
  builder generates. The design rules are PLAN.md §8 (D12): one accent, neutral greys,
  hairlines not shadows, small radii, no decoration.
- **The component library's CSS weighs exactly one class.** Every selector in
  `packages/components/src/css.ts` is a single class, `[data-*]` wrapped in `:where()`, no
  `!important`, so the per-node rules the inspector writes always win on source order. A
  rule that out-specifies `.ub-n-<id>` silently breaks the Design tab for that component.
  For the same reason a component never sets an inline style from a prop — it renders a
  `data-*` attribute and the sheet matches it.
- **An export is markup, with one narrow exception.** A component whose behaviour cannot be
  a static tree names an `EmitModule` in `components/src/runtime.ts`, and it must be a
  _wrapper_ — it takes the template's markup as children and adds behaviour, never markup
  of its own (D6). Such a spec also sets `interactive: true` so the canvas freezes it.
- **Nothing rewrites an expression the author typed.** The generated component defines
  `state`, `queries`, `item` and `index` around it instead. A prop's `code` is template
  source (`Hello {{ state.name }}`), not a bare JS expression, so it round-trips into the
  field it was typed in.
- **Access tokens are in memory only**, never `localStorage`. The httpOnly refresh cookie
  is what survives a reload, so `useAuth().user` has three states: `undefined` (still
  asking), `null` (signed out), and the user.
- **An error `message` is a sentence a user reads; technical detail goes elsewhere.**
  `ApiError.message` is rendered as-is by `formErrorMessage`, so framework or contract text
  must never reach it — `ApiError.detail` carries that, and logs it. On the server the same
  rule runs through `plugins/errors.ts`: only an `AppError` keeps its wording, Fastify's own
  4xx messages are mapped to studio-voice text by error code, and the original goes to the
  log as `raw`. Anything thrown out of a route that is not an `AppError` is a 500 with a
  generic message, so a new failure mode needs an `AppError` subclass, not a bare throw.
- **A toast is for a failure whose cause is not on screen.** `toast/ToastProvider.tsx` — a
  form field, a dialog banner or a whole-screen `ScreenMessage` already names what failed,
  and a toast repeating it is a second copy somewhere less useful. What it is for is
  everything that breaks while the user is looking elsewhere: a page query that fails on the
  canvas, autosave stopping, a session ending. Pass a `key` so a repeating failure collapses
  onto one row instead of stacking. Note `@ui-builder/runtime` has its own unrelated `Toast`
  — that one is a page _action step_ and renders inside the canvas iframe.
- **Role checks are shared.** `hasAtLeast` and `REQUIRES` live in `packages/schema` so the
  studio hides what the API would refuse. The server is still the enforcer.
- **Saves carry `baseVersion` and may be refused.** The API bumps `Project.version` with a
  conditional update, so a stale save is a 409, not a silent overwrite; the studio stops
  autosaving and asks which side to keep.
- ESLint: `eqeqeq` is an error, `no-console` warns (allows `warn`/`error`), type imports
  are inline. `apps/api` bans DOM globals via `no-restricted-globals` — its tsconfig has no
  DOM lib, and this is the backstop.

## API

Fastify, built by `buildApp()` in `apps/api/src/app.ts` without listening, so it can be
driven by `app.inject()`. Modules under `src/modules/<name>/` are `routes.ts` +
`service.ts`. Env is validated by zod in `src/env.ts` (loaded relative to the package, not
the cwd), and every third-party integration is optional so a fresh checkout boots with no
keys: no S3 config means asset routes answer 503 and the studio hides the button.

The document is stored as JSONB on `Project` (D4), not as relational node rows.

## Go-live punch list

From an audit on 2026-09-14, before the first production deploy. The automated gates were
all green at the time (typecheck, lint, 813 tests, build, `format:check`, and the `powerbi`
fixture export emitting → installing → `tsc --noEmit && vite build`), so none of these came
from a failing check — they are in the deploy path, on the public surface, and in the
newest code, which is where the suite does not look.

**All eleven are now fixed.** The gates are green again afterwards — typecheck, lint,
`format:check`, build, 813 package tests, and the `powerbi` export still emitting,
installing and building.

The API suite was run too — all 226 pass against the local Postgres, which is what covers
items 1, 2, 3, 6 and 7. The reuse-detection test ("treats a replayed token as theft") is the
one that matters for item 6: the sweep deletes only _expired_ rows, so the revoked row that
detects a replay is still there.

One thing could **not** be verified here, and is the first thing to check on the server:

- **The Caddyfile is unvalidated.** Docker was not running locally, so `caddy validate`
  never ran against it. Run `docker compose config`, then watch `docker compose logs web` on
  the first `up` — a Caddyfile error stops Caddy at boot, and items 4 and 8 both edited it.

Worth an eye on the first deploy: the rate limits (item 2) are a guess at what real traffic
looks like, and the number to watch is 429s on `/api/auth/refresh`, where the studio
refreshes on a timer and several open tabs share one address.

### Blockers

- [x] **1. `/health` leaked raw database errors publicly.** The route returned the driver's
      own message, and `deploy/Caddyfile` proxies `/health` unauthenticated — a Postgres
      failure names the host, port and role. Now a fixed string; the reason goes to the log.
- [x] **2. Nothing rate-limits `/api/auth/login`.** Login runs argon2 per attempt, so it is
      both a guessing oracle and a cheap way to spend the event loop. `plugins/rateLimit.ts`
      is written; it still has to be registered in `app.ts` and wired to the auth routes.
- [x] **3. Fastify does not set `trustProxy`.** Everything arrives via Caddy, so
      `request.ip` is the docker bridge address for every caller: logs misattribute, and the
      limiter from #2 would put the whole internet in one bucket. #2 is not correct without
      this.

### Real bugs

- [x] **4. The index.html no-cache header only covers `/`.** `@index path /` is an exact
      match in Caddy, so SPA deep links (`/projects/<id>`, `/published/<slug>`) are served
      index.html with no Cache-Control — the exact case the comment above it claims to
      prevent.
- [x] **5. Backups never leave the instance.** `deploy/backup.sh` writes to
      `$REPO_DIR/backups` on the same VM, while its header says it is what makes a reclaimed
      instance recoverable. It is not. The S3 credentials are already in `.env`.
- [x] **6. `RefreshToken` rows are never pruned.** Rotation revokes but never deletes and
      nothing sweeps expired rows — ~2,900 rows per active session per month, forever, on
      the table every refresh hits.

### Fail-open fragility

- [x] **7. Three security properties hinge on `NODE_ENV` with no assertion.** Unset or not
      exactly `production` and the refresh cookie silently loses `Secure`
      (`auth/tokens.ts`), the SSRF private-network guard flips to _allow_ (`env.ts`), and
      pino-pretty becomes the production logger. The Dockerfile and compose both set it, so
      the paved path is safe — but nothing checks, and compose does not set
      `INTEGRATION_ALLOW_PRIVATE_NETWORK` explicitly.
- [x] **8. No security headers from Caddy** — no HSTS, `nosniff`, or `Referrer-Policy`.
      Pointed, because public user-authored pages are served at `/published/:slug` from the
      studio's own origin.

### Performance

- [x] **9. One 1.02 MB JS chunk, no code splitting.** A visitor opening a public share link
      downloads the whole builder — canvas, inspector, codegen — to view one static page.
      Lazy-routing `SharedPageRoute` is the high-leverage split.
- [x] **10. `useIntegrationCatalog` returns a fresh object every render.** So
      `usePageQueries`' `requests` memo re-runs and `JSON.stringify`s every query request on
      every Canvas render. Correctness is fine (the auto-run effect dedupes on the string
      key); it is wasted work in the hottest path. A `useMemo` on `[list, secrets]` settles
      it.

### Minor

- [x] **11. Chart legends clip silently.** `react/Chart.tsx` lays legends out by counting
      characters into a fixed 320×180 viewBox with no wrapping: the cartesian legend runs off
      the right past ~4 series with ordinary names, the pie legend off the bottom past ~8
      categories. Entries vanish rather than wrapping.

Two things that looked wrong and are not, so they do not get re-investigated: `envVarName`
cannot collide across integrations (`SLUG_PATTERN` forbids underscores, so the mapping is
injective), and exports carry no embedded credentials — tokens become `VITE_*_TOKEN` env
vars, oauth2 included, which correctly degrades to "supply an access token" because a
browser bundle cannot hold a client secret.
