# Mike TV

A private, good-looking home screen for a family TV. It runs as a small local
web server (Python) and is shown full-screen on the TV. In use, it's a clean
grid of your streaming apps plus a "Continue Watching" row pulled from your own
Stremio account. When the TV sits idle, it fades into an **ambient dashboard** —
a big clock, the weather, and the week's dinners — like a Skylight frame.

Nothing is installed on the TV and nothing about the TV itself is changed.

## What it does

- **App grid** of your streaming services (opens the real site)
- **Continue Watching** row with real posters and resume progress, from your
  Stremio library
- **Ambient dashboard** when idle: clock, date, weather, and this week's meals
- **Remote control** three ways: your LG remote over HDMI-CEC, a phone over a
  QR code, or any USB arrow-key remote
- **Meal planner** you edit from your phone; it shows up on the ambient screen
- Three background themes, switchable live from on-screen Settings
- Choose which apps show and in what order

## How it's meant to run

The intended setup: a Proxmox box drives the TV over HDMI and **boots straight
into the UI full-screen** (a Chromium kiosk). The LG remote controls it over
the HDMI cable. See `deploy/kiosk/` for that, and `deploy/CONTAINER_SETUP.md`
for running the server itself as a service.

## Try it locally first

```bash
./run.sh
```

Then open `http://localhost:4950` in a browser, or
`http://<this-machine's-LAN-IP>:4950` from the TV/phone.

## Connect Stremio (for Continue Watching)

Run this once on the box that runs Mike TV. It trades your Stremio login for a
token and stores **only the token** in `data/secrets.json` (gitignored). Your
password is never written to disk.

```bash
python3 scripts/stremio_login.py
```

Continue Watching fills in within about two minutes. Settings shows the
connection status.

## Remote control

- **LG remote (recommended):** needs HDMI-CEC. Most PC GPUs don't carry CEC, so
  this usually means a small USB-CEC adapter (Pulse-Eight, ~$40). Setup and the
  honest hardware notes are in `deploy/kiosk/README.md`.
- **Phone:** open Settings on the TV and scan the QR code. The phone page also
  has the **Meals** tab for planning dinners.
- **USB remote:** any "air-mouse" style remote whose arrow keys / Enter / Esc
  work needs no setup at all.

## Project layout

```
server.py              the web server (aiohttp)
scripts/stremio_login.py   one-time Stremio token setup
templates/             the TV page (home) and the phone-remote page
static/                CSS and JS for both pages
data/config.json       your settings (theme, apps, order, meals) — gitignored
data/secrets.json      Stremio token — gitignored
deploy/                systemd unit + container setup notes
deploy/kiosk/          boot-into-UI kiosk + LG-remote (CEC) setup
```
