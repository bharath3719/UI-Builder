# syntax=docker/dockerfile:1
#
# The studio — a static Vite build, plus the Caddy that serves it and fronts the API.
#
# Those two are one image rather than two services because they are one job: Caddy is the
# thing that makes `/api` same-origin with the studio in production, which is exactly what
# vite.config.ts arranges in development ("matches the reverse-proxy shape in production").
# Keeping them together means no shared volume to keep in sync between a builder and a
# web server.
#
# Nothing about the API's address is baked in at build time. The studio calls `/api` on
# its own origin and Caddy decides where that goes, so this image is the same regardless
# of the domain it ends up on.

FROM node:22-bookworm-slim AS build
WORKDIR /repo
ENV CI=1

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/codegen/package.json packages/codegen/
COPY packages/components/package.json packages/components/
COPY packages/runtime/package.json packages/runtime/
COPY packages/schema/package.json packages/schema/
COPY packages/tsconfig/package.json packages/tsconfig/

RUN npm ci

COPY . .

RUN npm run build -w @ui-builder/web


# ── serve ───────────────────────────────────────────────────────────────────────────
FROM caddy:2-alpine AS serve

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv

EXPOSE 80 443
