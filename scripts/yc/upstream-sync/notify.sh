#!/usr/bin/env bash
# Posts one Discord embed about an upstream sync; the description comes from stdin. A failed post
# fails the job, so GitHub's failure mail still reports what Discord missed.
# Usage: notify.sh <review|merged|failed> <title> <url>. Needs DISCORD_WEBHOOK_URL.
set -euo pipefail

case $1 in
  review) color=14237451 ;; # D93F0B, the sync:needs-review label
  merged) color=952854 ;;   # 0E8A16, the sync:auto-merge label
  failed) color=13574702 ;; # CF222E
  *) echo "Unknown notification kind: $1" >&2; exit 2 ;;
esac

jq -n --arg title "$2" --arg url "$3" --argjson color "$color" --rawfile description /dev/stdin \
  '{username: "yc", embeds: [{title: $title, url: $url, color: $color, description: ($description | .[:4000])}]}' |
  curl -fsS -X POST -H 'Content-Type: application/json' --data-binary @- "$DISCORD_WEBHOOK_URL" >/dev/null
