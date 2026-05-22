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

# Install only scraper's dependency closure. `...` (three dots) tells pnpm
# to also pull anything scraper depends on transitively across workspaces;
# scraper has zero @sniffy/* deps today but the suffix is forward-compatible.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @sniffy/scraper...

# Copy source + tsconfig + scripts. .dockerignore keeps tests, fixtures
# beyond what's imported, and the local .env out of the image.
COPY scraper/tsconfig.json ./scraper/
COPY scraper/src ./scraper/src
COPY scraper/fixtures ./scraper/fixtures
COPY scraper/scripts ./scraper/scripts

RUN pnpm --filter @sniffy/scraper build

# pnpm deploy produces a flat, no-workspace-link, prod-only directory at
# /out — exactly what we want to drop into the runtime stage. This is the
# canonical pnpm 10 way to package a workspace member for deployment.
RUN pnpm --filter @sniffy/scraper deploy --prod /out

# Fixtures are read at runtime by data/fixtures.ts but live OUTSIDE the
# package.json `files` list, so pnpm deploy doesn't carry them over. Copy
# them explicitly so /sample + fixture-fallback paths keep working in prod.
RUN cp -R /repo/scraper/fixtures /out/fixtures

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
