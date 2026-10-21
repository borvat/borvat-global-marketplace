#!/usr/bin/env bash
set -euo pipefail

# BORVAT Global Marketplace - local isolated bootstrap
# Run manually on a trusted dev machine with PostgreSQL and Redis configured.
# This does not touch existing Sam/Lovable/QNAN projects.
if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: Bun is required. Install Bun on a trusted development machine." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js >=20 is required." >&2
  exit 1
fi
node -e 'const m=Number(process.versions.node.split(".")[0]); if(m<20)process.exit(1)' || {
  echo "ERROR: Node.js 20 or newer is required." >&2; exit 1;
}
if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: Git is required." >&2
  exit 1
fi

TARGET="${1:-borvat-mercur-local}"
if [ -e "$TARGET" ]; then
  echo "ERROR: Target exists. Choose an empty new folder." >&2
  exit 1
fi

cat <<'NOTICE'
BORVAT local-only Mercur bootstrap.
Do not supply production database URLs or credentials.
The official Mercur installer may request database configuration.
Any environment it creates MUST remain isolated.
This installer uses the upstream current release for a FIRST evaluation;
review and pin versions and commit the generated lockfile before production.
NOTICE

bun create mercur-app@latest "$TARGET"
cat <<NOTICE

Generated Mercur application in: $TARGET
Next steps (manual):
  cd "$TARGET"
  bun run dev
Verify API/admin/vendor routes from the output, and change/remove seeded
demo credentials before any network access.
No code has been pushed to BORVAT GitHub automatically.
NOTICE
