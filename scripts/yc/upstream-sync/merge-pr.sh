#!/usr/bin/env bash
# Merges a sync PR after YC passed on its head commit, and keeps upstream workflows disabled.
# Usage: merge-pr.sh <head branch> <head sha>. Needs GH_TOKEN (the PAT), ACTIONS_TOKEN (actions:
# write), GITHUB_REPOSITORY, and GITHUB_REPOSITORY_OWNER.
set -euo pipefail

branch=$1
sha=$2
KEEP_ENABLED='^\.github/workflows/(yc|yc-upstream-sync)\.yml$'

[[ $branch =~ ^bot/upstream-v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Not a sync branch: $branch"; exit 0; }

pr=$(gh pr list -R "$GITHUB_REPOSITORY" --head "$branch" --state open \
  --json number,headRefOid,isCrossRepository,author,labels,url,body --jq 'first // empty')
[[ -n $pr ]] || { echo "No open PR for $branch"; exit 0; }
number=$(jq -r .number <<<"$pr")
if ! jq -e --arg sha "$sha" --arg owner "$GITHUB_REPOSITORY_OWNER" '
  .headRefOid == $sha and (.isCrossRepository | not) and .author.login == $owner and
  (.labels | map(.name) | index("sync:auto-merge") and (index("sync:needs-review") | not))' <<<"$pr" >/dev/null; then
  echo "PR #$number is not ready for an automatic merge at $sha"
  exit 0
fi

# Workflows that ran on the PR are registered already; ones that only run on main appear after
# the merge, hence both passes. A new one may run once before the second pass catches it.
disable_upstream_workflows() {
  GH_TOKEN=$ACTIONS_TOKEN gh api --paginate "repos/$GITHUB_REPOSITORY/actions/workflows" \
    --jq '.workflows[] | select(.state == "active" and (.path | startswith(".github/workflows/"))) | "\(.id) \(.path)"' |
    while read -r id path; do
      [[ $path =~ $KEEP_ENABLED ]] && continue
      echo "Disabling $path"
      GH_TOKEN=$ACTIONS_TOKEN gh api -X PUT "repos/$GITHUB_REPOSITORY/actions/workflows/$id/disable"
    done
}

disable_upstream_workflows
gh api -X PUT "repos/$GITHUB_REPOSITORY/pulls/$number/merge" -f merge_method=merge -f sha="$sha" --jq .message
disable_upstream_workflows
gh api -X DELETE "repos/$GITHUB_REPOSITORY/git/refs/heads/$branch"

cost=$(jq -r .body <<<"$pr" | sed -nE 's/^\| 합계 \|.*\| (\$[0-9.]+) \|$/\1/p')
{
  echo "main CI가 통과하면 Release가 게시되고, Mac 업데이터가 받아 갑니다."
  echo "Claude ${cost:+API 환산 }${cost:-실행 안 함}"
} | "$(dirname "$0")/notify.sh" merged "자동 병합: upstream ${branch#bot/upstream-}" "$(jq -r .url <<<"$pr")"
