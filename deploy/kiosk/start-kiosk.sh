#!/usr/bin/env bash
# Launch Chromium full-screen (kiosk) pointing at the Mike TV server.
# Called by xinit from chromium-kiosk.service. No desktop environment needed.
set -e

URL="${MIKE_TV_URL:-http://localhost:4950}"

# Keep the screen awake: no blanking, no DPMS power saving.
xset -dpms || true
xset s off || true
xset s noblank || true

# Hide the mouse pointer after 1s idle.
command -v unclutter >/dev/null 2>&1 && unclutter -idle 1 &

# Wait for the server to answer before launching the browser, so an appliance
# boot where the TV box starts before the server (e.g. a separate container)
# doesn't land on a connection-error page. Gives up after ~2 minutes.
if command -v curl >/dev/null 2>&1; then
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "$URL" && break
    sleep 2
  done
fi

CHROME="$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)"
if [ -z "$CHROME" ]; then
  echo "No chromium/chrome found. Install with: apt install -y chromium" >&2
  exit 1
fi

# --kiosk          full screen, no chrome UI
# --incognito      don't nag about restoring tabs; fresh each boot
# the disable-* flags silence crash bubbles / update checks on an appliance
exec "$CHROME" \
  --kiosk "$URL" \
  --incognito \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --start-fullscreen
