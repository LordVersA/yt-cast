#!/bin/bash
# Installs yt-cast as a background service that starts at login.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.parsa.yt-cast"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"
STATE_DIR="$HOME/.yt-cast"

mkdir -p "$HOME/Library/LaunchAgents" "$STATE_DIR"

# A login shell's proxy settings are not inherited by launchd, so capture the
# current ones and bake them in; the daemon needs them to reach YouTube.
PROXY_KEYS=""
for var in HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY; do
  value="${!var:-}"
  [ -n "$value" ] && PROXY_KEYS="$PROXY_KEYS
    <key>$var</key><string>$value</string>"
done

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/src/daemon.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_USE_ENV_PROXY</key><string>1</string>$PROXY_KEYS
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$STATE_DIR/daemon.log</string>
  <key>StandardErrorPath</key><string>$STATE_DIR/daemon.log</string>
  <key>WorkingDirectory</key><string>$DIR</string>
</dict>
</plist>
PLISTEOF

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"

echo "Installed. The daemon is running and starts at login."
echo
echo "Next:"
echo "  1. Link the CLI:  npm link"
echo "  2. On your phone: YouTube → cast button → pick this Mac"
echo "  3. On your Mac:   yt-cast"
echo
echo "Logs:      tail -f $STATE_DIR/daemon.log"
echo "Uninstall: launchctl bootout gui/$UID/$LABEL && rm $PLIST"
