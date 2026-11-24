#!/bin/bash
# Installs the LaunchAgent that installs and updates YC, or removes it with --uninstall.
#   curl -fsSL https://raw.githubusercontent.com/ilcm96/yc/main/scripts/yc/install-updater.sh | bash
# Run it again to pick up a newer update.sh.
set -euo pipefail

LABEL="io.github.ilcm96.yc.updater"
STATE_DIR="$HOME/Library/Application Support/yc-updater"
SCRIPT="$STATE_DIR/update.sh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/yc-updater.log"
SOURCE_URL="https://raw.githubusercontent.com/ilcm96/yc/main/scripts/yc/update.sh"

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$PLIST" "$SCRIPT"
  echo "Removed the YC updater. YC.app stays installed."
  exit 0
fi

# Another app with YC's bundle id would take over t3code:// links, including sign-in callbacks.
for app in /Applications/*.app; do
  [[ "$app" == /Applications/YC.app ]] && continue
  if [[ "$(defaults read "$app/Contents/Info" CFBundleIdentifier 2>/dev/null)" == com.t3tools.t3code ]]; then
    echo "Remove $app first. Its data in ~/.t3 stays and YC uses it." >&2
    exit 1
  fi
done

mkdir -p "$STATE_DIR" "$(dirname "$PLIST")" "$(dirname "$LOG")"
if [[ -f "${BASH_SOURCE[0]:-}" && -f "$(dirname "${BASH_SOURCE[0]}")/update.sh" ]]; then
  cp "$(dirname "${BASH_SOURCE[0]}")/update.sh" "$SCRIPT"
else
  curl -fsSL "$SOURCE_URL" -o "$SCRIPT"
fi
chmod +x "$SCRIPT"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$UID" "$PLIST"
echo "Installed the YC updater. It checks now and every hour; log: $LOG"
