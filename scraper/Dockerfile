# syntax=docker/dockerfile:1.7
#
# Sniffy scraper container — multi-stage build per PLAN.md §10.4.
#
# Build context MUST be the repo root, not scraper/, because the build needs
# the workspace pnpm-lock.yaml + pnpm-workspace.yaml + every workspace
# package.json. Railway's railway.json sets the build root to the repo root
# and dockerfilePath to scraper/Dockerfile so the context is correct out of
# the box. For local builds, run from the repo root:
#
#   docker build -f scraper/Dockerfile -t sniffy-scraper:test .

# ---------- Stage 1: install + build ----------
FROM node:22-slim AS build
WORKDIR /repo

# Pin the same pnpm version as root package.json's `packageManager` field so
# install behavior is identical to local dev. Corepack is shipped with node 22.
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

# Copy workspace metadata first so pnpm install layer caches independently of
# source changes. Every workspace package.json must be present or pnpm errors
# out with "lockfile contains workspace entries that don't match installed
# packages."
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY scraper/package.json ./scraper/
COPY landing/package.json ./landing/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/cli/package.json ./packages/cli/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/aso-knowledge/package.json ./packages/aso-knowledge/

# Install only scraper's dependency closure. `...` (three dots) tells pnpm
# to also pull anything scraper depends on transitively across workspaces;
# scraper has zero @sniffy/* deps today but the suffix is forward-compatible.
RUN pnpm install --frozen-lockfile --filter @sniffy/scraper...

# Copy source + tsconfig only. Fixtures are embedded in
# scraper/src/data/fixtures.ts (not loaded from disk) so the production
# image doesn't need scraper/fixtures/ — avoids a Railway Metal-builder
# snapshot quirk that intermittently dropped that directory. scripts/ is
# dev tooling whose output is already committed under src/data/.
COPY scraper/tsconfig.json ./scraper/
COPY scraper/src ./scraper/src

RUN pnpm --filter @sniffy/scraper build

# pnpm deploy produces a flat, no-workspace-link, prod-only directory at
# /out — exactly what we want to drop into the runtime stage. pnpm 10
# requires --legacy for workspaces that haven't opted into
# inject-workspace-packages; scraper has zero @sniffy/* deps so legacy
# behavior is correct.
RUN pnpm --filter @sniffy/scraper deploy --prod --legacy /out

# Fixtures used to be copied here from scraper/fixtures/, but they are now
# embedded as TypeScript literals in scraper/src/data/fixtures.ts and ship
# with the rest of the compiled source.

# ---------- Stage 2: runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app

# `curl` is required by the HEALTHCHECK below and for the Railway probe.
# Slim node images don't include it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Drop privileges — the `node` user (uid 1000) ships with node:22-slim.
COPY --from=build --chown=node:node /out /app
USER node

ENV NODE_ENV=production
# Railway injects its own PORT; the env.ts schema defaults to 3001 when none
# is provided. EXPOSE is documentation only — Docker doesn't actually publish
# the port without `-p`.
EXPOSE 3001

# Container-local healthcheck. Railway adds its own /health probe in
# railway.json — this one keeps `docker run` and other portable hosts
# (Fly.io, Cloud Run) honest.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl --fail "http://localhost:${PORT:-3001}/health" || exit 1

CMD ["node", "dist/server.js"]
