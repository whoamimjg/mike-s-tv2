# Mike TV

A private, local home screen for a TV. It runs as a small web server (Python)
and the TV just displays a web page — either through the TV's own browser
over Wi-Fi, or via a computer plugged into the TV over HDMI. Nothing is
installed on the TV itself, and nothing about the TV is changed.

## What it does

- A clean grid of your streaming apps (tap/click opens the real site)
- Three background themes, switchable live from the on-screen settings panel
- Choose which apps show and in what order
- A phone acts as a remote control (arrows, OK, back) over a QR code

## Try it locally first

```bash
./run.sh
```

Then open `http://localhost:4950` in a browser on the same machine, or
`http://<this-machine's-LAN-IP>:4950` from the TV/phone.

## Running it full-time

This is meant to live somewhere that's always on — see
`deploy/CONTAINER_SETUP.md` for running it in a Proxmox LXC container as a
systemd service.

## Project layout

```
server.py          the web server (aiohttp)
templates/         the TV page and the phone-remote page
static/            CSS and JS for both pages
data/config.json   your current settings (theme, apps, order)
deploy/            systemd unit + container setup notes
```
