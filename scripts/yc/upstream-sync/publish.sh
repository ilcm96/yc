#!/usr/bin/env bash
# Pushes the resolved sync branch and the upstream tag, then opens or updates its PR. It runs no
# repository code, so it is the only step that holds the push token.
# Usage: publish.sh <tag> <tag commit sha> <work dir>. Needs GH_TOKEN (the PAT) and GITHUB_REPOSITORY.
set -euo pipefail

UPSTREAM=https://github.com/pingdotgg/t3code
tag=$1
tag_sha=$2
work=$3
branch="bot/upstream-$tag"

fail() {
  echo "::error::$1" >&2
  exit 1
}

# The artifact comes from the job that ran upstream's code, so it is parsed, never sourced.
value() { sed -n "s/^$1=//p" "$work/outputs" | head -n 1; }
review=$(value review)
main_sha=$(value main_sha)
head_sha=$(value head_sha)
[[ $review =~ ^(true|false)$ && $main_sha =~ ^[0-9a-f]{40}$ && $head_sha =~ ^[0-9a-f]{40}$ ]] ||
  fail "The sync outputs are malformed"
git merge-base --is-ancestor "$main_sha" origin/main || fail "$main_sha is not on main"

git fetch --quiet "$work/sync.bundle" "+refs/heads/$branch:refs/heads/$branch"
git fetch --quiet --no-tags --filter=blob:none "$UPSTREAM" "+refs/tags/$tag:refs/tags/$tag"
[[ $(git rev-parse "$tag^{commit}") == "$tag_sha" ]] || fail "$tag no longer points at $tag_sha"
[[ $(git rev-parse "$branch") == "$head_sha" ]] || fail "The bundle does not hold $head_sha"
[[ $(git rev-parse "$branch^1") == "$main_sha" && $(git rev-parse "$branch^2") == "$tag_sha" ]] ||
  fail "$branch is not a merge of main and $tag"

# The tag goes first: git describe in the release build needs it once the PR lands. The empty
# extraheader drops the read-only job token that actions/checkout left, so the PAT authenticates.
git -c core.hooksPath=/dev/null -c http.https://github.com/.extraheader= push --quiet \
  "https://x-access-token:$GH_TOKEN@github.com/$GITHUB_REPOSITORY.git" \
  "refs/tags/$tag" "+refs/heads/$branch:refs/heads/$branch"

gh label create sync:auto-merge -R "$GITHUB_REPOSITORY" --force --color 0E8A16 \
  --description "Upstream sync merged automatically once CI passes" >/dev/null
gh label create sync:needs-review -R "$GITHUB_REPOSITORY" --force --color D93F0B \
  --description "Upstream sync waiting for a human" >/dev/null
if [[ $review == true ]]; then
  label=sync:needs-review stale=sync:auto-merge
else
  label=sync:auto-merge stale=sync:needs-review
fi

number=$(gh pr list -R "$GITHUB_REPOSITORY" --head "$branch" --state open --json number --jq '.[0].number // empty')
if [[ -z $number ]]; then
  url=$(gh pr create -R "$GITHUB_REPOSITORY" --base main --head "$branch" \
    --title "chore(sync): upstream $tag 병합" --body-file "$work/body.md" --label "$label")
else
  gh pr edit "$number" -R "$GITHUB_REPOSITORY" --body-file "$work/body.md" \
    --add-label "$label" --remove-label "$stale" >/dev/null
  url=$(gh pr view "$number" -R "$GITHUB_REPOSITORY" --json url --jq .url)
fi
echo "$url"

# PRs opened with the owner's token send no GitHub notification, so Discord carries it.
if [[ $review == true ]]; then
  "$(dirname "$0")/notify.sh" review "리뷰 필요: upstream $tag" "$url" <"$work/notify.md"
fi
