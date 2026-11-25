#!/usr/bin/env bash
# Checks a sync result before it becomes a PR: catalogs, types, yc invariants, and the personal
# feature tests. It runs every check even after a failure, so one log shows all of them.
# The PR's CI runs every suite afterwards.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

failed=()
check() {
  echo "::group::$*"
  "$@" || failed+=("$*")
  echo "::endgroup::"
}

check vp run i18n:check
check vp run typecheck
check scripts/yc/check-invariants.sh

# The merge can bump Playwright past the browser installed for main; this is a no-op otherwise.
check node apps/web/node_modules/playwright/cli.js install --only-shell chromium

tests=$(grep -vE '^(#|$)' scripts/yc/upstream-sync/personal-tests.txt)
for package in $(sed -E 's#^([^/]+/[^/]+)/.*#\1#' <<<"$tests" | sort -u); do
  files=$(grep "^$package/" <<<"$tests" | sed "s#^$package/##")
  args=()
  [[ $package == apps/web ]] && args=(--project unit --project browser)
  # shellcheck disable=SC2086 # one argument per file
  check bash -c 'cd "$0" && exec vp test run "$@"' "$package" ${args[@]+"${args[@]}"} $files
done

if [[ ${#failed[@]} -gt 0 ]]; then
  printf '::error::verify.sh failed: %s\n' "${failed[@]}"
  exit 1
fi
