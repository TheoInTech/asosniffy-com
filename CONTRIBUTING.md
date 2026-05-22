# Contributing to Sniffy

Thanks for considering a contribution. Sniffy is small and opinionated — these
notes are about keeping it that way.

## TL;DR

- Read `PLAN.md` before opening a non-trivial PR. It is the source of truth for
  product scope, API contracts, payment requirements, and tech-stack
  decisions.
- Read `CLAUDE.md` for the load-bearing constraints (no relational DB, official
  Morph facilitator, iOS-first, etc.).
- Keep the **API contract in `PLAN.md` §9** as the canonical interface. Don't
  rename fields or change shapes without updating the PRD in the same PR.
- The repo is **MIT-licensed**. By submitting a PR you agree to license your
  contribution under MIT. No CLA required.

## Local Development

Requires Node 22+ and pnpm.

```bash
git clone https://github.com/TheoInTech/asosniffy-com
cd asosniffy-com
pnpm install
```

The repo is a pnpm workspace. The deployable apps are:

- `landing/` — Next.js, deployed to Vercel.
- `scraper/` — Hono backend, deployed to Railway in a `node:22-slim` Docker
  container.

The npm-publishable packages are:

- `packages/sdk` (`@gosniffy/sdk`)
- `packages/cli` (`@gosniffy/cli`)
- `packages/mcp` (`@gosniffy/mcp`)

Environment configuration:

- Copy `scraper/.env.example` to `scraper/.env` and fill in the local values.
- Never commit `.env*` files. The `.gitignore` already covers them.

## Running Tests

```bash
pnpm -r test
```

Backend logic and endpoint behavior are tested with Vitest. The `scraper/`
package is the source of truth for Zod schemas; if you change a schema, run the
tests in `packages/sdk` to confirm the SDK types still align.

## Opening a Pull Request

1. Branch from `main`. Branch name doesn't matter; commit history quality
   does.
2. Keep PRs scoped. One concern per PR. If you find a tangential bug, file a
   separate PR or open an issue.
3. Update `PLAN.md` in the same PR if your change alters product scope, the
   §9 API contract, or any architectural decision.
4. Add or update tests for any behavior change in `scraper/` or the packages.
5. For UI changes in `landing/`, include a screenshot or short clip in the PR
   description.
6. PR title should be a short imperative sentence; the body should explain
   *why*, not just *what*.

The owner can push directly to `main`; all other contributors must open a PR.
This is enforced via branch protection.

## Code Style

- TypeScript everywhere. No `any` unless there's a comment explaining why.
- Zod for request/response validation in `scraper/`.
- React Server Components and route handlers in `landing/` where possible —
  avoid client components when a server component will do.
- Keep files small. If a file passes ~300 lines, consider whether it should be
  split.

## Reporting Bugs

Open a GitHub issue with:

- What you tried.
- What you expected.
- What happened instead.
- A minimal reproduction (curl, code snippet, or steps in the UI).

For security issues, see `SECURITY.md` — please email instead of opening a
public issue.

## Conduct

Be kind, be specific, and assume good faith. See `CODE_OF_CONDUCT.md`.
