#!/usr/bin/env bash
# Picks the upstream stable tag to sync and prints key=value lines for $GITHUB_OUTPUT.
# Usage: detect.sh [tag] [force]. Needs GH_TOKEN and GITHUB_REPOSITORY, and origin/main fetched.
set -euo pipefail

UPSTREAM=https://github.com/pingdotgg/t3code
STABLE='^v[0-9]+\.[0-9]+\.[0-9]+$'
requested=${1:-}
force=${2:-false}

skip() {
  echo "$1" >&2
  echo "skip=true"
  exit 0
}

if [[ -n $requested ]]; then
  [[ $requested =~ $STABLE ]] || { echo "::error::$requested is not a stable tag" >&2; exit 1; }
  tag=$requested
else
  # Upstream also carries hundreds of nightly tags, and origin carries yc release tags.
  tag=$(git ls-remote --tags --refs "$UPSTREAM" 'refs/tags/v*' | sed 's#.*refs/tags/##' |
    grep -E "$STABLE" | sort -V | tail -n 1)
fi

git fetch --quiet --no-tags --filter=tree:0 "$UPSTREAM" "+refs/tags/$tag:refs/tags/$tag"
tag_sha=$(git rev-parse "$tag^{commit}")
if git merge-base --is-ancestor "$tag_sha" origin/main; then
  skip "main already contains $tag"
fi

open=$(gh pr list -R "$GITHUB_REPOSITORY" --state open --json number,headRefName \
  --jq '[.[] | select(.headRefName | startswith("bot/upstream-"))] | first // empty')
if [[ -n $open ]]; then
  number=$(jq -r .number <<<"$open")
  skip "Sync PR #$number is still open"
fi

branch="bot/upstream-$tag"
if [[ $force != true ]] &&
  [[ -n $(gh pr list -R "$GITHUB_REPOSITORY" --state closed --head "$branch" --json number --jq '.[].number') ]]; then
  skip "A closed sync PR for $tag exists; run with force to sync it again"
fi

echo "skip=false"
echo "tag=$tag"
echo "tag_sha=$tag_sha"
