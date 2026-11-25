#!/usr/bin/env bash
# Fails when the tree undoes a yc guarantee that no type or test would catch. The built app's
# missing app-update.yml is checked in yc.yml's build job instead.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

status=0
if git grep -n 'AnalyticsService.layer' -- apps/server/src ':!*.test.ts'; then
  echo "::error::The server provides the real AnalyticsService again; keep DisabledAnalytics.layer"
  status=1
fi
if ! git grep -q 'DisabledAnalytics.layer' -- apps/server/src/server.ts; then
  echo "::error::server.ts no longer provides DisabledAnalytics.layer"
  status=1
fi
exit "$status"
