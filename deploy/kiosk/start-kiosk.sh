#!/usr/bin/env bash
# Launch Chromium full-screen (kiosk) pointing at the Mike TV server.
# Called by startx/xinit. No desktop environment needed.
set -e

URL="${MIKE_TV_URL:-http://localhost:4950}"
# Resolution to drive the TV at. 1080p is ample for a 10-foot UI and light on
# the iGPU; override by exporting MIKE_TV_MODE=3840x2160 if you want native 4K.
MODE="${MIKE_TV_MODE:-1920x1080}"
WIDTH="${MODE%x*}"
HEIGHT="${MODE#*x}"

# Keep the screen awake: no blanking, no DPMS power saving.
xset -dpms || true
xset s off || true
xset s noblank || true

# Pin the display to one output at a fixed mode. Many TVs advertise 4K as their
# preferred mode, so X builds a 4K framebuffer while the browser opens a smaller
# window and ends up in a corner. Force the connected output to $MODE and size
# the framebuffer to match, with every other output off.
if command -v xrandr >/dev/null 2>&1; then
  PRIMARY="$(xrandr --query | awk '/ connected/{print $1; exit}')"
  if [ -n "$PRIMARY" ]; then
    for OUT in $(xrandr --query | awk '/ (connected|disconnected)/{print $1}'); do
      [ "$OUT" = "$PRIMARY" ] || xrandr --output "$OUT" --off || true
    done
    xrandr --output "$PRIMARY" --mode "$MODE" --pos 0x0 --primary --fb "$MODE" \
      || xrandr --output "$PRIMARY" --auto --primary || true
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
# --window-size/position + device-scale-factor 1 pin it to fill the screen
# --incognito      don't nag about restoring tabs; fresh each boot
exec "$CHROME" \
  --kiosk "$URL" \
  --incognito \
  --window-position=0,0 \
  --window-size="${WIDTH},${HEIGHT}" \
  --force-device-scale-factor=1 \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --start-fullscreen
