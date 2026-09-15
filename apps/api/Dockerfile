# syntax=docker/dockerfile:1
#
# The API image. Build context is the repo root, not apps/api — npm workspaces resolve
# `@ui-builder/*` through the root lockfile, so a build that cannot see the root cannot
# install anything.
#
# Debian slim rather than Alpine: `@node-rs/argon2` is a native module, and on arm64
# (Ampere A1, which is what the Always Free shape gives you) the glibc prebuild is the
# well-trodden one. Alpine would pull the musl variant and save ~40MB for a class of
# problem that is tedious to debug on a remote VM.
#
# Note what is *not* here: Prisma engine binaries. src/db/client.ts talks to Postgres
# through the `@prisma/adapter-pg` driver adapter, so the generated client is plain
# TypeScript and there is no platform-specific engine to install or match.

FROM node:22-bookworm-slim AS base
WORKDIR /repo
ENV CI=1


# ── deps ────────────────────────────────────────────────────────────────────────────
# Only the manifests, so this layer is cached until a dependency actually changes.
# Every workspace's package.json has to be present or npm refuses to resolve the tree.
FROM base AS deps

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/codegen/package.json packages/codegen/
COPY packages/components/package.json packages/components/
COPY packages/runtime/package.json packages/runtime/
COPY packages/schema/package.json packages/schema/
COPY packages/tsconfig/package.json packages/tsconfig/

RUN npm ci


# ── build ───────────────────────────────────────────────────────────────────────────
FROM deps AS build

COPY . .

# `prisma generate` reads prisma7.config.ts, which reads DATABASE_URL. It never connects
# during generate, but it does want the variable to exist — so this is a placeholder, not
# a credential, and nothing in the output depends on its value.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

RUN npm run db:generate
RUN npm run build -w @ui-builder/api


# ── migrate ─────────────────────────────────────────────────────────────────────────
# Migrations run as their own short-lived container (see `migrate` in compose.yaml) so
# the API image does not have to carry the Prisma CLI, which is a devDependency. This
# stage is just the build stage with a different command — it costs no extra layers,
# because compose builds both targets from the same cache.
FROM build AS migrate

CMD ["npm", "run", "db:deploy", "-w", "@ui-builder/api"]


# ── runner ──────────────────────────────────────────────────────────────────────────
# tsup bundles the `@ui-builder/*` packages into dist/server.js but leaves every real
# dependency external, so the runtime still needs a production node_modules.
#
# This installs the prod tree for *all* workspaces, which drags in the web app's React
# and Radix for no reason (~50MB). Scoping it with `--workspace @ui-builder/api` works on
# paper and is the kind of thing that fails differently on a machine you are SSHed into;
# the plain install is the boring, lockfile-faithful one. Change it if image size starts
# to matter.
FROM base AS runner

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/codegen/package.json packages/codegen/
COPY packages/components/package.json packages/components/
COPY packages/runtime/package.json packages/runtime/
COPY packages/schema/package.json packages/schema/
COPY packages/tsconfig/package.json packages/tsconfig/

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /repo/apps/api/dist apps/api/dist

# src/env.ts loads apps/api/.env relative to the bundle, finds nothing here, and falls
# through to the real environment — which is what compose supplies.
USER node
EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
