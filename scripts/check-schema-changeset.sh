#!/usr/bin/env bash
# SCHEMA_VERSION drift guard.
#
# If the scraper's SCHEMA_VERSION changed vs the base branch but no changeset
# is present, fail — forcing an explicit "do we need to republish @gosniffy/*?"
# decision every time the response contract moves. The published SDK bundles a
# snapshot of these schemas, so a contract bump without a republish is how a
# client goes stale and (pre-fix) lost paid responses.
#
# Runs in CI on pull_request. Skips gracefully outside PR context.
set -euo pipefail

SCHEMA_FILE="scraper/src/schemas/index.ts"
BASE_REF="${1:-origin/main}"

current_version() {
  grep -oE 'SCHEMA_VERSION = "[^"]+"' "$1" | sed -E 's/.*"([^"]+)".*/\1/'
}

# Base version (empty if the file/ref doesn't exist — treat as "no change").
base_src="$(git show "${BASE_REF}:${SCHEMA_FILE}" 2>/dev/null || true)"
if [ -z "$base_src" ]; then
  echo "schema-drift-guard: no base ${SCHEMA_FILE} at ${BASE_REF} — skipping."
  exit 0
fi

base_ver="$(printf '%s' "$base_src" | grep -oE 'SCHEMA_VERSION = "[^"]+"' | sed -E 's/.*"([^"]+)".*/\1/' || true)"
head_ver="$(current_version "$SCHEMA_FILE")"

if [ "$base_ver" = "$head_ver" ]; then
  echo "schema-drift-guard: SCHEMA_VERSION unchanged (${head_ver}) — ok."
  exit 0
fi

# Version changed — require at least one changeset (any *.md besides README).
changesets="$(find .changeset -maxdepth 1 -name '*.md' ! -name 'README.md' 2>/dev/null || true)"
if [ -n "$changesets" ]; then
  echo "schema-drift-guard: SCHEMA_VERSION ${base_ver} → ${head_ver} with a changeset present — ok."
  exit 0
fi

cat >&2 <<EOF
schema-drift-guard: FAILED.
  SCHEMA_VERSION changed: ${base_ver} → ${head_ver}
  ...but no changeset is present under .changeset/.

The response contract moved. The published @gosniffy/* packages bundle a
snapshot of these schemas, so consumers go stale until you republish. Decide:
  • Republish (recommended): run \`pnpm changeset\` and add a bump for the
    @gosniffy/* packages, commit the .changeset/*.md, and push.
  • Deliberately not republishing (e.g. an internal-only field): add a changeset
    anyway documenting the decision, or an empty one (\`pnpm changeset --empty\`).
EOF
exit 1
