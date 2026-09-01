#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[ -f package.json ] || fail "run from the scaffold root"
[ -f .env ] || fail "setup did not create .env"
secret="$(grep '^JWT_SECRET=' .env | cut -d= -f2-)" || fail "JWT_SECRET missing"
[[ ! "$secret" =~ [Cc][Hh][Aa][Nn][Gg][Ee]-[Mm][Ee]|[Pp][Ll][Aa][Cc][Ee][Hh][Oo][Ll][Dd][Ee][Rr] ]] \
  || fail "placeholder JWT_SECRET remains in .env"
[ "${#secret}" -ge 32 ] || fail "JWT_SECRET is too short (${#secret})"

bun install --frozen-lockfile
bun run db:generate
bun run db:migrate
bun run --workspaces --if-present typecheck
bun run lint
bun test
bun run --workspaces --if-present build

manifest() {
  find . \( -name node_modules -o -name .git \) -prune -o -type f -print0 \
    | LC_ALL=C sort -z | xargs -0 shasum | shasum
}

before="$(manifest)"
bun run setup
[ "$before" = "$(manifest)" ] || fail "setup is not idempotent"

fixture="apps/web/src/modules/_fixture-a/index.ts"
[ -f "$fixture" ] || fail "boundary fixture missing"
cp "$fixture" "$fixture.verify-backup"
restore_fixture() { mv -f "$fixture.verify-backup" "$fixture" 2>/dev/null || true; }
trap restore_fixture EXIT
echo "import '../_fixture-b/internal/x';" >> "$fixture"
if bun run lint; then
  fail "boundary violation was not caught"
fi
restore_fixture
trap - EXIT
bun run lint

bun test apps/api/src/error/on-error.test.ts
bun test apps/api/src/middleware/rate-limit-proxy.test.ts
bun run check:agents-md
mobile_package="$(bun -e "console.log('@'+require('./package.json').name+'/mobile')")"
bun run --filter "$mobile_package" bundle:ci

if grep -rniE 'force-error|/__debug|/__test|/dev/|/internal/' apps/*/src \
     --include='*.ts' --include='*.tsx' | grep -v '\.test\.\|__tests__\|/modules/_fixture-'; then
  fail "suspicious debug route reachable outside tests"
fi

if grep -rl '@yourorg/' . \
     --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
     --exclude='setup.ts' --exclude='postinstall.ts' --exclude='verify.sh' \
     | grep -q .; then
  fail "unpersonalised @yourorg scope remains"
fi

echo "ALL CHECKS PASSED"
