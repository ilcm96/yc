#!/usr/bin/env bash
# Merges an upstream stable tag into bot/upstream-<tag>, lets Claude resolve conflicts or fix a
# failed verification, has Claude review every personal feature, decides whether a human must
# review, and commits the merge.
# Usage: resolve.sh <tag> <tag commit sha> <work dir>. Run from main with a clean tree.
# Leaves sync.bundle, body.md, notify.md, and outputs (key=value lines) in the work dir.
# YC_SYNC_NO_CLAUDE=1 skips Claude, for trying the flow locally.
set -euo pipefail

tag=$1
tag_sha=$2
work=$3
here=$(cd "$(dirname "$0")" && pwd)
branch="bot/upstream-$tag"
mkdir -p "$work"

fail() {
  echo "::error::$1" >&2
  exit 1
}

# Our side's edits here need a human even when upstream changed the same paths freely.
SENSITIVE='^(\.github/|scripts/yc/|scripts/build-desktop-artifact\.ts$|\.env\.example$|apps/server/src/(auth|cloud|relay|telemetry|observability|desktopUpdate)/|apps/server/src/persistence/Migrations|apps/server/src/server\.ts$|apps/desktop/src/updates/|apps/desktop/src/electron/ElectronUpdater\.ts$)'
# A new upstream module here may be a new way to send data out (PERSONAL.md, 텔레메트리 차단).
TRIPWIRE_DIRS=(apps/server/src/telemetry apps/server/src/observability)
GIT_GUARD=('Bash(git commit:*)' 'Bash(git merge:*)' 'Bash(git reset:*)' 'Bash(git rebase:*)'
  'Bash(git stash:*)' 'Bash(git push:*)' 'Bash(git switch:*)')

# The working copy as a tree, conflict markers included, without touching the real index.
worktree_tree() {
  local index="$work/snapshot.index"
  cp "$(git rev-parse --git-path index)" "$index"
  GIT_INDEX_FILE=$index git add -A
  GIT_INDEX_FILE=$index git write-tree
  rm -f "$index"
}

verify() {
  (vp install && "$here/verify.sh") 2>&1 | tee "$work/verify-$1.log"
}

# One headless Claude session reading $work/<name>-prompt.md; fails on an error or a timeout.
# Usage: claude_session <name> <minutes> <claude flags>
claude_session() {
  local name=$1 minutes=$2
  shift 2
  [[ ${YC_SYNC_NO_CLAUDE:-} != 1 ]] || return 1
  # Project settings come from upstream, so their hooks and MCP servers must not load.
  timeout --signal=INT "${minutes}m" claude -p --model opus --output-format json \
    --setting-sources user --strict-mcp-config --permission-mode dontAsk --add-dir "$work" "$@" \
    <"$work/$name-prompt.md" >"$work/$name.json" || return 1
  jq -e '.is_error == false' "$work/$name.json" >/dev/null
}

# Markdown table of tokens per session and model, at list prices; the runs bill the subscription.
claude_usage() {
  local files=()
  for name in resolve review; do
    if [[ -s $work/$name.json ]]; then files+=("$work/$name.json"); fi
  done
  [[ ${#files[@]} -gt 0 ]] || return 0
  jq -rn '
    def commas: tostring | if length <= 3 then . else (.[:-3] | commas) + "," + .[-3:] end;
    def usd: (. * 100 | round) as $c | "$\($c / 100 | floor).\($c % 100 | tostring | if length < 2 then "0" + . else . end)";
    def row: "| \(.name) | \(.inputTokens | commas) | \(.outputTokens | commas) | \(.cacheCreationInputTokens | commas) | \(.cacheReadInputTokens | commas) | \(.costUSD | usd) |";
    [inputs | (if input_filename | endswith("resolve.json") then "해결" else "리뷰" end) as $stage
      | (.modelUsage // {}) | to_entries[] | .value + {name: "\($stage) · `\(.key)`"}] as $rows
    | "| 단계 · 모델 | 입력 | 출력 | 캐시 쓰기 | 캐시 읽기 | API 환산 비용 |",
      "|---|---:|---:|---:|---:|---:|",
      ($rows[] | row),
      ({name: "합계"} + ($rows | reduce .[] as $m ({}; . + {
        inputTokens: (.inputTokens + $m.inputTokens), outputTokens: (.outputTokens + $m.outputTokens),
        cacheCreationInputTokens: (.cacheCreationInputTokens + $m.cacheCreationInputTokens),
        cacheReadInputTokens: (.cacheReadInputTokens + $m.cacheReadInputTokens), costUSD: (.costUSD + $m.costUSD)
      })) | row)
  ' "${files[@]}" 2>/dev/null || echo "사용량을 읽지 못했습니다."
}

md_list() { sed 's/^/- `/; s/$/`/'; }

# Merge.
[[ -z $(git status --porcelain) ]] || fail "The working tree is not clean"
main_sha=$(git rev-parse HEAD)
[[ $(git rev-parse "$tag^{commit}") == "$tag_sha" ]] || fail "$tag no longer points at $tag_sha"
old_tag=$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' --exclude '*-*' "$main_sha")
git switch --quiet -c "$branch"
git merge --no-ff --no-commit "$tag" || true
git rev-parse -q --verify MERGE_HEAD >/dev/null || fail "git merge did not start"
git diff --name-only --diff-filter=U >"$work/conflicts.txt"

# Resolve and verify. The resolver runs at most once, and only when needed.
verified=false
resolver=skipped
: >"$work/claude-changed.txt"
if [[ ! -s $work/conflicts.txt ]] && verify 1; then
  verified=true
else
  {
    cat "$here/resolve-prompt.md"
    printf '\n## 이번 작업\n\n- 태그: `%s`\n- 보고 파일: `%s`\n' "$tag" "$work/resolve-report.json"
    if [[ -s $work/conflicts.txt ]]; then
      printf -- '- 충돌 파일:\n'
      sed 's/^/  - `/; s/$/`/' "$work/conflicts.txt"
    else
      printf -- '- 충돌 없이 병합됐지만 검증이 실패했습니다. 로그 끝부분:\n\n```\n'
      tail -n 150 "$work/verify-1.log"
      printf '```\n'
    fi
  } >"$work/resolve-prompt.md"
  before=$(worktree_tree)
  if claude_session resolve 70 --allowedTools Read Edit Write Glob Grep Bash TodoWrite Agent \
    --disallowedTools "${GIT_GUARD[@]}"; then
    resolver=ok
  else
    resolver=failed
  fi
  git diff --name-only "$before" "$(worktree_tree)" >"$work/claude-changed.txt"
  if [[ $resolver == failed && ! -s $work/claude-changed.txt ]]; then
    # Usage limits or an expired token: push nothing, so tomorrow's run tries again.
    fail "Claude ended without changing anything; see resolve.json"
  fi
  if verify 2; then verified=true; fi
fi
markers=$(xargs -r grep -lE '^(<<<<<<<|>>>>>>>)( |$)' <"$work/conflicts.txt" 2>/dev/null || true)

# Commit with Git's default merge message; the hooks would run upstream code with no say in this.
git add -A
git -c core.hooksPath=/dev/null commit --quiet --no-edit
[[ $(git rev-parse HEAD^1) == "$main_sha" && $(git rev-parse -q --verify HEAD^2 || true) == "$tag_sha" ]] ||
  fail "The commit is not a merge of main and $tag"
head_sha=$(git rev-parse HEAD)
git bundle create "$work/sync.bundle" "refs/heads/$branch" "^$main_sha"

# Review every personal feature: tests pass on a feature that upstream left unreachable.
features=$(awk '/^## 유지할 개인 기능/{f=1;next} /^## /{f=0} f && /^### /{sub(/^### /,""); print}' PERSONAL.md)
git diff "$old_tag" "$main_sha" -- . ':!assets' >"$work/patch-before.diff"
git diff "$tag_sha" HEAD -- . ':!assets' >"$work/patch-after.diff"
overlap=$( (git diff --name-only "$old_tag" "$main_sha" -- . ':!assets'
  git diff --name-only "$tag_sha" HEAD -- . ':!assets') | sort -u |
  grep -vE '^\.github/|/i18n/translations/' || true)
if [[ -n $overlap ]]; then
  # shellcheck disable=SC2086 # one pathspec per file
  git diff "$old_tag" "$tag_sha" -- $overlap >"$work/upstream-overlap.diff"
else
  : >"$work/upstream-overlap.diff"
fi
{
  cat "$here/review-prompt.md"
  printf '\n## 이번 작업\n\n- 태그: `%s` (이전 태그 `%s`)\n- 보고 파일: `%s`\n' "$tag" "$old_tag" "$work/review-report.json"
  for file in patch-before.diff patch-after.diff upstream-overlap.diff; do
    printf -- '- `%s`: `%s` (%s줄)\n' "$file" "$work/$file" "$(wc -l <"$work/$file" | tr -d ' ')"
  done
} >"$work/review-prompt.md"
reviewer=ok
claude_session review 40 --allowedTools Read Write Glob Grep Bash TodoWrite Agent \
  --disallowedTools "${GIT_GUARD[@]}" || reviewer=failed
review_valid=false
if jq -e '(.features | type) == "array" and (.summary | type) == "string" and
  all(.features[]; (.name | type) == "string" and (.status | IN("ok", "suspect", "broken")))' \
  "$work/review-report.json" >/dev/null 2>&1; then
  review_valid=true
fi

# Review gate.
reasons=()
[[ $verified == true ]] || reasons+=("\`verify.sh\` 실패")
[[ -z $markers ]] || reasons+=("충돌 표시 남음: $(tr '\n' ' ' <<<"$markers")")
if [[ $resolver != skipped ]]; then
  [[ $resolver == ok ]] || reasons+=("Claude 해결 오류 또는 시간 초과")
  if jq -e '(.needsReview | type) == "boolean" and (.reason | type) == "string" and (.summary | type) == "string"' \
    "$work/resolve-report.json" >/dev/null 2>&1; then
    if jq -e .needsReview "$work/resolve-report.json" >/dev/null; then
      reasons+=("Claude 리뷰 요청: $(jq -r .reason "$work/resolve-report.json")")
    fi
  else
    reasons+=("Claude 해결 보고 누락")
  fi
fi
ours=$(sort -u "$work/conflicts.txt" "$work/claude-changed.txt" | grep -E "$SENSITIVE" || true)
[[ -z $ours ]] || reasons+=("민감 경로 수정: $(tr '\n' ' ' <<<"$ours")")
protected=$(grep -Fxf <(grep -vE '^(#|$)' "$here/personal-tests.txt"; echo PERSONAL.md; echo AGENTS.md) \
  "$work/claude-changed.txt" || true)
[[ -z $protected ]] || reasons+=("개인 기능 테스트 수정: $(tr '\n' ' ' <<<"$protected")")
base=$(git merge-base "$main_sha" "$tag_sha")
added=$(git diff --name-only --diff-filter=A "$base" "$tag_sha" -- "${TRIPWIRE_DIRS[@]}" | grep -vE '\.test\.ts$' || true)
[[ -z $added ]] || reasons+=("새 텔레메트리 모듈: $(tr '\n' ' ' <<<"$added")")
if [[ $review_valid == true ]]; then
  while IFS= read -r line; do reasons+=("$line"); done < <(jq -r --arg features "$features" '
    ($features | split("\n") | map(select(length > 0))) as $expected
    | (.features | map(.name)) as $named
    | (.features[] | select(.status != "ok") | "기능 점검 \(if .status == "broken" then "깨짐" else "의심" end): \(.name)"),
      ($expected - $named | .[] | "기능 점검 누락: \(.)")' "$work/review-report.json")
elif [[ $reviewer == ok ]]; then
  reasons+=("Claude 리뷰 보고 누락")
fi
[[ $reviewer == ok ]] || reasons+=("Claude 리뷰 오류 또는 시간 초과")
review=$([[ ${#reasons[@]} -gt 0 ]] && echo true || echo false)

# PR body.
usage=$(claude_usage)
cost=$(sed -nE 's/^\| 합계 \|.*\| (\$[0-9.]+) \|$/\1/p' <<<"$usage")
conflict_count=$(grep -c . "$work/conflicts.txt" || true)
changed_count=$(grep -c . "$work/claude-changed.txt" || true)
case $resolver in
  skipped) resolver_cell="실행 안 함" ;;
  ok) resolver_cell="파일 ${changed_count}개 수정" ;;
  failed) resolver_cell="오류 · 파일 ${changed_count}개 수정" ;;
esac
if [[ $review_valid == true ]]; then
  checks="정상 $(jq '[.features[] | select(.status == "ok")] | length' "$work/review-report.json") / $(grep -c . <<<"$features")"
else
  checks="실행 실패"
fi
new_workflows=$(git diff --name-only --diff-filter=A "$main_sha" HEAD -- .github/workflows)
{
  echo "upstream [\`$tag\`](https://github.com/pingdotgg/t3code/releases/tag/$tag) 병합"
  echo
  if [[ $review == true ]]; then
    echo "> [!WARNING]"
    echo "> 자동 병합하지 않았습니다. 확인 후 merge commit으로 병합해 주세요."
    printf '> - %s\n' "${reasons[@]}"
  else
    echo "> [!NOTE]"
    echo "> CI가 통과하면 자동으로 병합합니다."
  fi
  echo
  echo "| 충돌 | Claude 해결 | 검증 | 기능 점검 |"
  echo "|---|---|---|---|"
  echo "| ${conflict_count}개 | $resolver_cell | $([[ $verified == true ]] && echo 통과 || echo 실패) | $checks |"
  if [[ $review_valid == true ]]; then
    echo
    echo "### 개인 기능 점검"
    echo
    echo "| 기능 | 결과 | 근거 |"
    echo "|---|---|---|"
    jq -r '.features[] | "| \(.name) | \({ok: "✅ 정상", suspect: "⚠️ 의심", broken: "❌ 깨짐"}[.status]) | \(.note // "" | gsub("\\|"; "\\|") | gsub("\n"; " ")) |"' "$work/review-report.json"
    if [[ -n $(jq -r .summary "$work/review-report.json") ]]; then
      echo
      echo "### 리뷰 메모"
      echo
      jq -r .summary "$work/review-report.json"
    fi
  fi
  if jq -e '.summary | type == "string"' "$work/resolve-report.json" >/dev/null 2>&1; then
    echo
    echo "### Claude 해결 요약"
    echo
    jq -r .summary "$work/resolve-report.json"
  fi
  if [[ -s $work/conflicts.txt || -s $work/claude-changed.txt ]]; then
    echo
    echo "<details><summary>충돌 파일 ${conflict_count}개 · Claude가 수정한 파일 ${changed_count}개</summary>"
    echo
    if [[ -s $work/conflicts.txt ]]; then echo "#### 충돌 파일"; echo; md_list <"$work/conflicts.txt"; echo; fi
    if [[ -s $work/claude-changed.txt ]]; then echo "#### Claude가 수정한 파일"; echo; md_list <"$work/claude-changed.txt"; echo; fi
    echo "</details>"
  fi
  if [[ -n $new_workflows ]]; then
    echo
    echo "<details><summary>새 upstream 워크플로 $(grep -c . <<<"$new_workflows")개 · 병합할 때 비활성화</summary>"
    echo
    md_list <<<"$new_workflows"
    echo
    echo "</details>"
  fi
  if [[ -n $usage ]]; then
    echo
    echo "<details><summary>Claude 사용량${cost:+ · API 환산 $cost}</summary>"
    echo
    echo "$usage"
    echo
    echo "</details>"
  fi
} >"$work/body.md"
if [[ -n $usage && -n ${GITHUB_STEP_SUMMARY:-} ]]; then
  printf '### Claude 사용량\n\n%s\n' "$usage" >>"$GITHUB_STEP_SUMMARY"
fi

# Discord text for a PR that waits for review.
{
  if [[ $review == true ]]; then printf -- '- %s\n' "${reasons[@]}"; fi
  echo "충돌 ${conflict_count}개 · 기능 점검 $checks · Claude ${cost:+API 환산 }${cost:-비용 정보 없음}"
} >"$work/notify.md"

{
  echo "review=$review"
  echo "main_sha=$main_sha"
  echo "head_sha=$head_sha"
} | tee "$work/outputs"
