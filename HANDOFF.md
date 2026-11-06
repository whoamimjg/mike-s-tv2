# Mike TV — Handoff

A handoff for a new agent picking up this project. It covers the goal, what is
built and running, exactly how it is deployed, the journey and decisions, the
dead end we hit, and the direction the owner now wants to explore (an Android
box for real streaming apps).

Owner: Michael Greene. Repo: `github.com/whoamimjg/mike-s-tv2` (branch `master`).
Local working copy on the owner's Mac: `~/Documents/mike-tv`.

---

## 1. The goal (in the owner's words)

Replace the LG smart-TV experience with a private, family-friendly home screen:
- A clean launcher of the streaming apps the family uses.
- A "when idle" ambient dashboard like a Skylight frame: big clock, weather,
  the week's meals, and family photos.
- Driven by the TV's own LG remote where possible.
- Rooting the LG TV was discussed and dropped (2022-era exploits only, fragile,
  freezes you on insecure firmware). We went with an external box instead.

## 2. What is built (all working)

Mike TV is a small Python (aiohttp) web app that renders a 10-foot UI. Features
shipped and confirmed working on the real TV:

- **App grid** — tiles of streaming services; clicking navigates the kiosk
  browser to the real site. Config-driven (which apps, order).
- **Continue Watching** — real posters + resume bars pulled from the owner's
  **Stremio** account library (via `api.strem.io`, read-only auth token).
- **Ambient dashboard** (idle screensaver) — giant clock, date, weather
  (Open-Meteo, Akron OH), "This Week's Meals", and a **Google Photos** album
  rotating in the background like a photo frame. Any key wakes it.
- **Weekly meals** — either typed on the phone, or (what the owner uses) read
  from a **Google Calendar** their AI recipe manager writes to, via that
  calendar's iCal URL.
- **Phone remote** — `/remote` page: a D-pad that drives the launcher over a
  websocket, plus **Meals** and **Photos** setup tabs.
- **Themes**, app show/hide/reorder, all from on-screen Settings.

### File map
```
server.py              aiohttp app; all API endpoints
scripts/stremio_login.py   one-time Stremio token setup -> data/secrets.json
templates/home.html    the TV page
templates/remote.html  the phone remote + Meals/Photos setup
static/js/home.js      launcher, focus nav, ambient dashboard, photo bg
static/js/remote.js    phone remote + meals/photos settings
static/css/            home.css, remote.css
data/config.json       settings (gitignored)
data/secrets.json      Stremio token, meal iCal URL, photo album URL (gitignored)
deploy/mike-tv.service        systemd unit for the server
deploy/CONTAINER_SETUP.md     container install notes
deploy/kiosk/                 the host kiosk + LG-remote (CEC) setup
```

### Key API endpoints (all on the server, port 4950)
- `GET /api/config`, `POST /api/config`
- `GET /api/weather` (Open-Meteo, cached)
- `GET /api/continue` (Stremio Continue Watching)
- `GET /api/meals`, `GET|POST /api/meals/settings` (manual or Google Calendar iCal)
- `GET /api/photos`, `GET|POST /api/photos/settings` (Google Photos shared album)
- `GET /api/info`, `GET /api/qr`, `GET /ws` (phone remote websocket)

## 3. How it is deployed (the real topology)

Two machines matter: a Proxmox **container** runs the server, the Proxmox
**host** drives the TV.

- **Proxmox host** — `192.168.0.123:8006`. Intel UHD Graphics 630 (`i915`),
  HDMI out to the TV on output **HDMI-2**. The host runs the kiosk browser.
- **Container 107 "MIKETV"** — **unprivileged Ubuntu LXC**, IP **192.168.0.67**,
  app at `/opt/mike-tv`, Python venv, `mike-tv.service` (systemd), port **4950**.
  Serves the UI at `http://192.168.0.67:4950`.
- **Container 109 "stremio"** — the owner's self-hosted Stremio (separate; Mike
  TV reads the Stremio *account* cloud, not this container directly).

### The kiosk (on the host, not the container)
The host shows the UI full-screen. Setup lives in `deploy/kiosk/`:
- A `kiosk` user **auto-logs in on tty1** (getty override) and runs `startx`,
  which launches `deploy/kiosk/start-kiosk.sh` → a Chromium kiosk pointed at
  `http://192.168.0.67:4950`.
- `start-kiosk.sh` forces the output to **1920x1080** and sizes the browser to
  match (see "dead ends solved" below).
- `cec-bridge.py` + `cec-bridge.service` translate LG-remote HDMI-CEC presses
  into keystrokes. **Not active yet** — needs a USB-CEC adapter (see §6).

### To deploy an update
On the container (`pct enter 107` from the host, no `sudo` on the host — it is
not installed; you are already root):
```
cd /opt/mike-tv && git pull && ./venv/bin/pip install -r requirements.txt && systemctl restart mike-tv
```
Then reload the kiosk so the browser reloads the new front-end — on the host:
```
systemctl restart getty@tty1
```

### Secrets (in `data/secrets.json` on the container, gitignored)
- `stremio_authkey` — set by `scripts/stremio_login.py` (stores only the token).
- `meals_ical_url` — the Google Calendar "Meal Plan" iCal address.
- `photos_album_url` — the Google Photos shared-album link.

## 4. Dead ends already solved (don't re-debug these)

- **Local dev on the Mac**: the original `venv` was built against a broken
  Python shim. `/usr/bin/python3` works directly; rebuild `venv` with it. Deps:
  `aiohttp`, `qrcode[pil]`, `icalendar`.
- **Kiosk wouldn't start in the LXC**: running X for the HDMI output inside an
  **unprivileged** LXC is impractical (logind paused DRM fd, no VT). Decision:
  run the kiosk **on the Proxmox host**, which owns the iGPU and HDMI. The
  container only serves the page. This works well.
- **`systemd-logind returned paused fd` / `open /dev/dri/card0` fatal**: X as a
  background service wasn't the active seat session. Fix: **auto-login on tty1 +
  startx** (the active console). Also the GPU node here is `card1`, not `card0`.
- **"Half the screen"**: the TV advertises **4K as its preferred mode**, so X
  built a 3840x2160 framebuffer while Chromium opened a smaller window in the
  corner. Fix: `start-kiosk.sh` forces `1920x1080` and sizes the browser to it
  (override with `MIKE_TV_MODE`).
- **Google Photos**: the official Photos API no longer allows unattended album
  reads, so we scrape the **public shared-album** page for image URLs. Works,
  but is unofficial and may need a parser patch if Google changes the page.

## 5. THE CURRENT DEAD END — real streaming apps

Clicking a streaming tile opens the real website in the kiosk browser, but:

- The kiosk browser is **Chromium** (open-source), which ships **without
  Widevine DRM**. Netflix, Disney+, Max, Hulu, and Prime Video therefore refuse
  to play. YouTube, Spotify, Plex, Jellyfin, and Stremio work (no Widevine).
- **There are no native Linux apps** for those services. On Linux the browser
  *is* the app; native apps exist only for Android TV / Windows / Mac. So
  "install the app on the container" is not possible, and the container is
  headless anyway (the picture comes from the host).

### The small fix we offered (not yet done)
Swap the kiosk browser to **Google Chrome**, which bundles Widevine. DRM sites
then play, but Linux browsers are **capped by the studios** — Netflix ~720p,
others usually 1080p. `start-kiosk.sh` already prefers `google-chrome-stable`
if installed; Chrome just needs installing on the host. Also note: once you
navigate into a streaming site you leave the Mike TV page, so the **phone remote
stops working there** — real streaming needs a **hardware remote** (USB-CEC
adapter or a USB air-mouse), and a button mapped to return to the launcher.

## 6. The direction the owner now wants: an Android box

The owner is leaning toward **Android** to get genuine native streaming apps
(real Netflix/Disney+/etc., proper remote UI, better quality). The new agent
should help evaluate and execute. The main options, with the real trade-offs:

**A. A dedicated Android TV device at the TV (most pragmatic).**
e.g. Chromecast with Google TV, Walmart Onn 4K Pro, or Nvidia Shield. Native
apps "just work" with real DRM (Shield/certified devices get Widevine L1 =
HD/4K). The open question is how Mike TV's custom UI fits: on stock Android TV
you generally **can't replace the launcher** without workarounds, though some
devices allow a sideloaded custom launcher (e.g. "Customize Google TV", FLauncher,
or setting a default-launcher app). Likely end state: native apps for streaming +
Mike TV loaded as a web app/dashboard (kiosk browser app, or a WebView wrapper),
or Mike TV rebuilt as an Android launcher. This also revisits the owner's
original "replace the smart-TV UI" goal.

**B. Android on the Proxmox box (Waydroid / Android-x86 VM).**
Keeps everything on the existing hardware. Waydroid runs Android in a container;
Android-x86 in a VM with GPU passthrough. Caveats: **x86 vs ARM** app
compatibility (many TV apps are ARM; need libhoudini/libndk translation), and
**Widevine is typically only L3 (~480–720p)** in emulated/virtual Android, so
premium quality is limited — similar ceiling to the Chrome route, with far more
setup. Driving the TV's HDMI from this still runs into the host-display questions
from §4.

**C. Keep the web kiosk, add Chrome for DRM (the quick win).**
Not "native apps," but an hour of work and makes the DRM sites play at ~720p.
Reasonable stopgap while deciding on A or B.

### Recommended framing for the owner
A **dedicated Android TV device (A)** is the realistic way to get true native
apps and good quality; the integration question is how much of the custom Mike
TV UI to keep (full web dashboard the box opens, vs. rebuilding as an Android
launcher). Waydroid (B) keeps the hardware unified but caps quality and is a big
lift. The Chrome swap (C) is the cheap stopgap. Confirm with the owner which of
these to pursue before building.

## 7. Open items / next steps
- **Decide the Android path** (A vs B) with the owner, then scope it.
- **USB-CEC adapter** (Pulse-Eight) to make the LG remote drive the kiosk; the
  bridge is ready (`deploy/kiosk/cec-bridge.py`, `cec-bridge.service`). Until
  then, phone remote + a USB air-mouse work.
- **Chrome swap** on the host if they want the DRM stopgap now.
- **Meals latency**: the Google "Meal Plan" calendar is an *imported* calendar,
  so Google refreshes it on its own (slow) schedule. If meals lag, point Mike TV
  at the recipe manager's own `.ics` feed instead for near-instant updates.
- **Return-to-launcher**: once Chrome/native apps are in, map a remote button to
  get back to the Mike TV home screen.

## 8. How to run it locally (for the new agent)
```
cd ~/Documents/mike-tv
rm -rf venv && /usr/bin/python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python server.py      # http://localhost:4950 ; /remote for the phone page
```
Front-end is plain HTML/CSS/JS; syntax-check with `node --check static/js/*.js`.
No build step. Commit style: short subject + body; the repo's attribution line
is `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
