#!/bin/bash
# Re-signs YC.app from an electron-builder zip with the yc self-signed certificate and zips it again.
# Usage: sign-macos-app.sh <input.zip> <output.zip>
# Env: YC_CODESIGN_P12_BASE64, YC_CODESIGN_P12_PASSWORD
set -euo pipefail

input=$1
output=$2
work=$(mktemp -d)
keychain="$work/signing.keychain-db"
keychain_password=$(openssl rand -hex 16)
original_keychains=$(security list-keychains -d user | tr -d '"' | xargs)

cleanup() {
  security delete-keychain "$keychain" 2>/dev/null || true
  # shellcheck disable=SC2086
  security list-keychains -d user -s $original_keychains
  rm -rf "$work"
}
trap cleanup EXIT

printf '%s' "$YC_CODESIGN_P12_BASE64" | base64 --decode >"$work/cert.p12"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 3600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
# codesign only finds identities in keychains on the search list.
# shellcheck disable=SC2086
security list-keychains -d user -s "$keychain" $original_keychains
security import "$work/cert.p12" -k "$keychain" -P "$YC_CODESIGN_P12_PASSWORD" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null
identity=$(security find-identity -p codesigning "$keychain" | awk '/"yc Code Signing"/ { print $2; exit }')
if [[ -z "$identity" ]]; then
  echo "yc Code Signing identity not found in the imported certificate" >&2
  exit 1
fi

ditto -x -k "$input" "$work/unpacked"
app="$work/unpacked/YC.app"
codesign --force --deep --timestamp=none --sign "$identity" --keychain "$keychain" "$app"
codesign --verify --deep --strict "$app"
codesign --display --requirements - "$app" 2>&1 | grep designated

rm -f "$output"
ditto -c -k --keepParent "$app" "$output"
