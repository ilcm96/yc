#!/bin/bash
# Installs the latest YC release when it differs from the installed app. The LaunchAgent from
# install-updater.sh runs this at login and every hour. Touch "$STATE_DIR/pinned" to hold a version.
set -euo pipefail

REPOSITORY="${YC_UPDATE_REPOSITORY:-ilcm96/yc}"
RELEASE_API="${YC_UPDATE_RELEASE_API:-https://api.github.com/repos/$REPOSITORY/releases/latest}"
APP_DIR="${YC_APP_DIR:-/Applications}"
STATE_DIR="${YC_UPDATER_STATE_DIR:-$HOME/Library/Application Support/yc-updater}"
# SHA-1 of the yc Code Signing certificate; a build signed by anything else is refused.
CERT_LEAF="711d1749806a79290a5cab74f51a72c16fc9c0e3"

APP="$APP_DIR/YC.app"
BACKUP="$APP_DIR/YC.app.old"
STAGING="$STATE_DIR/staging"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"
}

# A run cut off mid-swap leaves the previous app as YC.app.old.
recover_interrupted_swap() {
  [[ -e "$BACKUP" ]] || return 0
  if [[ -e "$APP" ]]; then
    rm -rf "$BACKUP"
  else
    mv "$BACKUP" "$APP"
    log "restored the previous app from an interrupted update"
  fi
}

main() {
  mkdir -p "$STATE_DIR"
  recover_interrupted_swap

  if [[ -e "$STATE_DIR/pinned" ]]; then
    log "pinned; skipping"
    return 0
  fi

  local release tag latest installed asset_url digest
  release=$(curl -fsSL --retry 2 -H 'Accept: application/vnd.github+json' "$RELEASE_API")
  tag=$(jq -r '.tag_name' <<<"$release")
  latest=${tag#v}
  installed=$(defaults read "$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo none)
  if [[ "$latest" == "$installed" ]]; then
    return 0
  fi

  if pgrep -xq YC; then
    log "YC $latest is available; waiting for YC to quit"
    return 0
  fi

  asset_url=$(jq -r '[.assets[] | select(.name | endswith("-arm64.zip"))][0].browser_download_url // empty' <<<"$release")
  digest=$(jq -r '[.assets[] | select(.name | endswith("-arm64.zip"))][0].digest // empty' <<<"$release")
  if [[ -z "$asset_url" || "$digest" != sha256:* ]]; then
    log "release $tag has no arm64 zip with a sha256 digest"
    return 1
  fi

  rm -rf "$STAGING"
  mkdir -p "$STAGING"
  curl -fsSL --retry 2 -o "$STAGING/YC.zip" "$asset_url"
  if [[ "$(shasum -a 256 "$STAGING/YC.zip" | cut -d' ' -f1)" != "${digest#sha256:}" ]]; then
    log "downloaded zip does not match the release digest"
    return 1
  fi

  ditto -x -k "$STAGING/YC.zip" "$STAGING/unpacked"
  local new_app="$STAGING/unpacked/YC.app"
  if ! codesign --verify --deep --strict -R "=certificate leaf = H\"$CERT_LEAF\"" "$new_app"; then
    log "downloaded app is not signed with the yc certificate"
    return 1
  fi
  if [[ "$(defaults read "$new_app/Contents/Info" CFBundleShortVersionString)" != "$latest" ]]; then
    log "downloaded app is not version $latest"
    return 1
  fi

  # The app and the staging folder share the data volume, so each mv is a rename.
  [[ -e "$APP" ]] && mv "$APP" "$BACKUP"
  if mv "$new_app" "$APP"; then
    rm -rf "$BACKUP" "$STAGING"
  else
    [[ -e "$BACKUP" ]] && mv "$BACKUP" "$APP"
    log "could not move the new app into place"
    return 1
  fi

  log "updated YC from $installed to $latest"
  osascript -e "display notification \"YC $latest 버전으로 업데이트했습니다.\" with title \"YC\"" >/dev/null 2>&1 || true
}

main "$@"
