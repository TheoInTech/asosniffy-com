# Phase 07: Deployment

## Goal

Ship `scraper` to Railway (Docker, `node:22-slim`), `landing` to Vercel (native Next.js), provision Redis (Upstash preferred), wire all secrets, verify no secrets in git history, and flip the repo public so the `SKILL.md` install command works.

## Status & Dependencies

- **Status**: not-started
- **Depends on**:
  - Phase 02 — runnable Hono server with `/health`, `/quote`, `/diagnose`, `/sample`
  - Phase 05 — buildable Next.js landing
  - Phase 06 — `SKILL.md` at repo root (Vercel skills install path needs the repo public)
- **Blocks**: Phase 08 (QA tests against the deployed surface), Phase 09 (submission video records the live URL)
- **Can run in parallel with**: nothing — this is the deploy gate

## Sequential Tasks

### 07.s1 — Secrets audit + repo-public prerequisites

This is the **only** task that absolutely must complete before the public flip. If anything fails, do not flip.

- **Recommended agent**: `principal-devsecops-architect` (skills: `senior-devops`, `api-security-best-practices`)
- **Scope**: repo-root metadata, `.gitignore`, secrets verification
- **Inputs**:
  - `PLAN.md` §17 Milestone 3.5 (public flip checklist), §23.4 (Public-Repo Hygiene)
  - `CLAUDE.md` "Open-Source Posture"
- **Deliverables**:
  - Audit script `scripts/audit-secrets.sh` (or use `gitleaks` directly) — scans the full git history for: hex strings 64+ chars long, `BEGIN PRIVATE KEY` headers, env var-shaped strings (e.g. `MORPH_X402_SECRET_KEY=...`), `.env`-typed files, wallet `.json` files
  - Verified `.gitignore` covers: `.env`, `.env.*` (except `.env.example`), `*.key`, `*.pem`, `wallet.json`, `secrets/`, `node_modules/`, `dist/`, `.next/`
  - `.env.example` at repo root is complete: every env var any workspace consumes is listed with a placeholder value (`MORPH_X402_ACCESS_KEY`, `MORPH_X402_SECRET_KEY`, `MORPH_X402_FACILITATOR_URL`, `MORPH_FACILITATOR_MODE`, `SNIFFY_PAYTO_ADDRESS`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `REDIS_URL`, `SNIFFY_PRIVATE_KEY`, `NEXT_PUBLIC_SCRAPER_BASE_URL`, `NEXT_PUBLIC_REOWN_PROJECT_ID`, `PORT`)
  - `SECURITY.md` exists with a real disclosure email (already present per `CLAUDE.md` — verify content)
- **Acceptance**:
  - `gitleaks detect --source . --no-banner` returns no findings
  - `git log -p --all -S 'MORPH_X402_SECRET_KEY='` shows no leaks
  - `cat .gitignore | grep -E '^\.env\*$'` matches
- **Out of scope**: do not flip the repo public yet (07.s2 owns that, gated on this passing)
- **References**: `PLAN.md` §17, §23.4; `CLAUDE.md` "Open-Source Posture"

## Parallelizable Tasks

The three deploy targets are independent. Run them in parallel after 07.s1 passes — but **do not flip the repo public** (07.s2) until all three deploys are reachable.

### 07.p1 — `scraper` Dockerfile + Railway deploy

- **Recommended agent**: `principal-devsecops-architect` (skills: `senior-devops`, `docker-expert`)
- **Scope**: `scraper/Dockerfile`, `scraper/.dockerignore`, `railway.json` (or service config in Railway dashboard)
- **Inputs**:
  - `PLAN.md` §10 (Containerization Decision — `node:22-slim` base, only `scraper` is containerized)
  - Outputs from Phase 02 (the runnable server)
- **Deliverables**:
  - Multi-stage `scraper/Dockerfile`:
    - **Stage 1 (builder)**: `node:22-slim` with `corepack enable && corepack prepare pnpm@latest --activate`. Copy `pnpm-lock.yaml`, `pnpm-workspace.yaml`, all `package.json` files using filters. `pnpm fetch && pnpm install --frozen-lockfile --filter @sniffy/scraper`. Copy source. `pnpm --filter @sniffy/scraper build`.
    - **Stage 2 (runtime)**: `node:22-slim`. Copy only the built artifacts from stage 1 and production node_modules. Non-root user. `HEALTHCHECK` hitting `/health`. `EXPOSE 3001`. `CMD ["node", "dist/server.js"]`.
  - `scraper/.dockerignore` excluding `node_modules`, `dist`, `.env*`, `tests`, fixtures kept (they ship with the image so `/sample` works)
  - Railway service config: build command auto-detected from Dockerfile, env vars wired (see 07.s1 list), public domain configured, health check pointed at `/health`, autoscaling left at default for the hackathon
- **Acceptance**:
  - `docker build -f scraper/Dockerfile -t sniffy-scraper:test .` (from repo root) builds successfully
  - `docker run -p 3001:3001 -e MORPH_X402_FACILITATOR_URL=... sniffy-scraper:test` starts and `curl localhost:3001/health` returns 200
  - Railway service URL (e.g. `https://api.sniffy.io`) responds 200 on `/health`
  - Image size under ~250 MB (production node_modules + dist)
- **Out of scope**: do not containerize the frontend (`CLAUDE.md` is explicit); do not migrate to Cloud Run yet (post-MVP option, see `PLAN.md` §10)
- **References**: `PLAN.md` §10; `docker-expert` skill, `senior-devops` skill

### 07.p2 — `landing` Vercel deploy

- **Recommended agent**: `principal-devsecops-architect` (skills: `senior-devops`, `next-best-practices`)
- **Scope**: Vercel project config, env vars, custom domain
- **Inputs**:
  - `PLAN.md` §10 (Vercel native Next.js — do not containerize)
  - Outputs from Phase 05
- **Deliverables**:
  - Vercel project linked to the GitHub repo root; build target is `landing/`
  - Build settings: `pnpm install` (root), `pnpm --filter @sniffy/landing build`, output directory `landing/.next`
  - Env vars on Vercel: `NEXT_PUBLIC_SCRAPER_BASE_URL=https://api.sniffy.io`, `NEXT_PUBLIC_REOWN_PROJECT_ID=...`
  - Custom domain `sniffy.io` (or `asosniffy.io`) wired to the production deployment; `www.` redirects; HTTPS enforced
  - Preview deploys gated to repo collaborators (or open — choice for the hackathon; prefer open so judges can preview the latest commit)
- **Acceptance**:
  - `https://sniffy.io/` (or chosen domain) returns the landing page
  - The landing page successfully calls `https://api.sniffy.io/api/v1/aso/sample` and renders the canned report
  - Wallet connection works against Morph Hoodi from the deployed frontend
- **Out of scope**: do not enable Vercel Analytics yet (post-MVP); do not add Vercel Edge functions (the backend stays on Railway)
- **References**: `PLAN.md` §10; `next-best-practices` skill

### 07.p3 — Redis provisioning

- **Recommended agent**: `principal-devsecops-architect` (skills: `senior-devops`)
- **Scope**: Upstash (preferred) or Railway Redis add-on
- **Inputs**:
  - `PLAN.md` §10 (Redis-compatible cache, Upstash or Railway)
  - Phase 03 cache wrapper expects `REDIS_URL` (and Upstash REST URL/token if using `@upstash/redis`)
- **Deliverables**:
  - Provisioned Upstash Redis (Free tier is sufficient for hackathon traffic) **or** Railway Redis plugin attached to the `scraper` service
  - `REDIS_URL` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) set on the Railway `scraper` service
  - Eviction policy: `allkeys-lru` (Upstash default; verify)
  - Maxmemory: free-tier default is fine for hackathon
- **Acceptance**:
  - Hitting the same `/quote` endpoint twice in a row shows the second response with `provenance: 'cached'` for the relevant sections (live verification on the Railway deploy)
  - Redis dashboard shows non-zero key count after a few calls
- **Out of scope**: do not provision a persistent disk; do not cluster Redis
- **References**: `PLAN.md` §10; `business-model.md` §3 (cache hit ratio metric)

## Final Sequential Step

### 07.s2 — Flip repo public

Runs only after **07.s1 passed**, all three deploys (07.p1, 07.p2, 07.p3) are reachable, and `SKILL.md` is committed.

- **Recommended agent**: `principal-devsecops-architect` (skills: `senior-devops`)
- **Inputs**:
  - 07.s1 audit clean
  - 07.p1 `https://api.sniffy.io/health` returns 200
  - 07.p2 `https://sniffy.io/` returns 200
  - 07.p3 Redis cache working
  - `SKILL.md` committed at repo root
- **Deliverables**:
  - Repo visibility flipped to public on GitHub
  - Branch protection on `main` confirmed (per `CLAUDE.md`) — PRs required for non-admins, owner can push directly
  - Smoke-test: `npx skills add TheoInTech/asosniffy-com` in a fresh Claude Code project installs the skill
  - Add a topic / "About" section on the GitHub repo pointing to `https://sniffy.io` and the hackathon writeup
- **Acceptance**:
  - GitHub repo at `https://github.com/TheoInTech/asosniffy-com` is publicly viewable without auth
  - The Vercel skills install command works
  - Branch protection rules still in effect after the flip
- **Out of scope**: do not announce on social yet (Phase 09 owns submission communications); do not transfer the repo to another org
- **References**: `PLAN.md` §17 Milestone 3.5, §23

## Phase Verification

```bash
# Secrets audit
bash scripts/audit-secrets.sh  # exits 0
gitleaks detect --source . --no-banner

# Backend reachable
curl -fsS https://api.sniffy.io/health | jq '.ok == true' | grep -q true

# Frontend reachable
curl -fsS https://sniffy.io/ | grep -q 'Sniffy'

# Sample endpoint works against deployed backend
curl -fsS https://api.sniffy.io/api/v1/aso/sample | jq '.sample == true' | grep -q true

# Diagnose returns real 402 against deployed backend
test $(curl -sS -o /dev/null -w '%{http_code}' -X POST https://api.sniffy.io/api/v1/aso/diagnose \
  -H "Content-Type: application/json" \
  -d '{"store":"ios","app":"https://apps.apple.com/us/app/example/id123456789","country":"US","keywords":["habit tracker"],"sniffId":"sniff_check"}') = "402"

# Cache is working (run /quote twice with the same input)
curl -fsS -X POST https://api.sniffy.io/api/v1/aso/quote -d '<input>' > /tmp/q1.json
sleep 1
curl -fsS -X POST https://api.sniffy.io/api/v1/aso/quote -d '<input>' > /tmp/q2.json
# /tmp/q2.json should show at least one section with provenance: cached

# SKILL.md install works
mkdir /tmp/skill-test && cd /tmp/skill-test && npx skills add TheoInTech/asosniffy-com
```

## References

- `PLAN.md` §10 (Deployment Topology, Containerization Decision)
- `PLAN.md` §17 Milestone 3.5
- `PLAN.md` §23.4 (Public-Repo Hygiene)
- `CLAUDE.md` "Open-Source Posture", "Branch Protection"
- Skills: `senior-devops`, `docker-expert`, `next-best-practices`
- Prior phase: [`06-distribution-kit.md`](./06-distribution-kit.md)
- Next phase: [`08-qa-and-demo.md`](./08-qa-and-demo.md)
