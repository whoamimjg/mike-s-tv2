#!/usr/bin/env bash
# Launch Chromium full-screen (kiosk) pointing at the Mike TV server.
# Called by startx/xinit. No desktop environment needed.
set -e

URL="${MIKE_TV_URL:-http://localhost:4950}"

# Keep the screen awake: no blanking, no DPMS power saving.
xset -dpms || true
xset s off || true
xset s noblank || true

# Collapse to a single active output (the TV). Intel chips often report a
# second, phantom output; left alone, X builds a side-by-side desktop and the
# UI ends up on half the screen. Enable the first connected output at its
# preferred mode and turn every other output off, so the framebuffer matches
# the TV exactly before Chromium sizes itself to it.
if command -v xrandr >/dev/null 2>&1; then
  PRIMARY="$(xrandr --query | awk '/ connected/{print $1; exit}')"
  if [ -n "$PRIMARY" ]; then
    xrandr --output "$PRIMARY" --auto --primary || true
    for OUT in $(xrandr --query | awk '/ (connected|disconnected)/{print $1}'); do
      [ "$OUT" = "$PRIMARY" ] || xrandr --output "$OUT" --off || true
    done
  fi
fi

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
# --window-position/size pin it to the top-left of the (now single) screen
# the disable-* flags silence crash bubbles / update checks on an appliance
exec "$CHROME" \
  --kiosk "$URL" \
  --incognito \
  --window-position=0,0 \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --start-fullscreen
