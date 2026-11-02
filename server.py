#!/usr/bin/env python3
"""Mike TV - a private, local home screen for your TV.

Runs as a small local web server. On the Proxmox box it is shown full-screen
by a Chromium kiosk over HDMI (see deploy/kiosk/). A phone can also act as a
remote control over the local network, and an LG remote works through the
HDMI-CEC bridge (deploy/kiosk/cec-bridge.py).
"""
import json
import os
import socket
import io
import time
from pathlib import Path

import aiohttp
from aiohttp import web, WSMsgType
import qrcode

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "config.json"
EXAMPLE_FILE = BASE_DIR / "data" / "config.example.json"
SECRETS_FILE = BASE_DIR / "data" / "secrets.json"
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
PORT = 4950

# Akron, OH. Change these if you move, or we can make this a Settings field later.
WEATHER_LAT = 41.0814
WEATHER_LON = -81.5190
WEATHER_TIMEZONE = "America/New_York"
WEATHER_CACHE_SECONDS = 600  # Open-Meteo is free/keyless; still no need to hit it every page load.

# Stremio account sync (reads your own library "continue watching").
STREMIO_API = "https://api.strem.io/api"
CONTINUE_CACHE_SECONDS = 120

# Websocket connections from TV displays, so a phone remote can reach them.
tv_sockets = set()

_weather_cache = {"time": 0, "data": None}
_continue_cache = {"time": 0, "data": None}

WEATHER_CODES = {
    0: ("Clear", "☀️"),
    1: ("Mostly clear", "\U0001F324️"),
    2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁️"),
    45: ("Fog", "\U0001F32B️"),
    48: ("Fog", "\U0001F32B️"),
    51: ("Drizzle", "\U0001F326️"),
    53: ("Drizzle", "\U0001F326️"),
    55: ("Drizzle", "\U0001F326️"),
    61: ("Rain", "\U0001F327️"),
    63: ("Rain", "\U0001F327️"),
    65: ("Heavy rain", "\U0001F327️"),
    66: ("Freezing rain", "\U0001F327️"),
    67: ("Freezing rain", "\U0001F327️"),
    71: ("Snow", "❄️"),
    73: ("Snow", "❄️"),
    75: ("Heavy snow", "❄️"),
    77: ("Snow grains", "❄️"),
    80: ("Rain showers", "\U0001F326️"),
    81: ("Rain showers", "\U0001F326️"),
    82: ("Rain showers", "\U0001F326️"),
    85: ("Snow showers", "\U0001F328️"),
    86: ("Snow showers", "\U0001F328️"),
    95: ("Thunderstorm", "⛈️"),
    96: ("Thunderstorm", "⛈️"),
    99: ("Thunderstorm", "⛈️"),
}

# Keys added over time; make sure older config.json files gain sane defaults.
CONFIG_DEFAULTS = {
    "ambient": {"enabled": True, "idle_seconds": 120},
    "meals": [
        {"day": "Mon", "meal": ""},
        {"day": "Tue", "meal": ""},
        {"day": "Wed", "meal": ""},
        {"day": "Thu", "meal": ""},
        {"day": "Fri", "meal": ""},
        {"day": "Sat", "meal": ""},
        {"day": "Sun", "meal": ""},
    ],
    "stremio": {"enabled": True},
}


def load_config():
    if not DATA_FILE.exists():
        # First run on this machine: start from the shipped defaults.
        # config.json itself is gitignored, so your own settings here
        # never get overwritten by a later `git pull`.
        DATA_FILE.write_text(EXAMPLE_FILE.read_text())
    with open(DATA_FILE) as f:
        cfg = json.load(f)
    changed = False
    for key, default in CONFIG_DEFAULTS.items():
        if key not in cfg:
            cfg[key] = default
            changed = True
    if changed:
        save_config(cfg)
    return cfg


def save_config(cfg):
    tmp = DATA_FILE.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(cfg, f, indent=2)
    tmp.replace(DATA_FILE)


def load_secrets():
    if SECRETS_FILE.exists():
        try:
            return json.loads(SECRETS_FILE.read_text())
        except Exception:
            return {}
    return {}


def local_ip():
    """Best-effort LAN IP for this machine; doesn't require real internet access."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


async def handle_index(request):
    return web.FileResponse(TEMPLATES_DIR / "home.html")


async def handle_remote(request):
    return web.FileResponse(TEMPLATES_DIR / "remote.html")


async def handle_get_config(request):
    return web.json_response(load_config())


async def handle_post_config(request):
    body = await request.json()
    cfg = load_config()
    cfg.update(body)
    save_config(cfg)
    return web.json_response(cfg)


async def handle_info(request):
    ip = local_ip()
    return web.json_response({
        "ip": ip,
        "port": PORT,
        "remote_url": f"http://{ip}:{PORT}/remote",
    })


async def handle_qr(request):
    url = f"http://{local_ip()}:{PORT}/remote"
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return web.Response(body=buf.getvalue(), content_type="image/png")


async def handle_weather(request):
    now = time.time()
    if _weather_cache["data"] and now - _weather_cache["time"] < WEATHER_CACHE_SECONDS:
        return web.json_response(_weather_cache["data"])

    params = {
        "latitude": WEATHER_LAT,
        "longitude": WEATHER_LON,
        "current": "temperature_2m,weather_code",
        "temperature_unit": "fahrenheit",
        "timezone": WEATHER_TIMEZONE,
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://api.open-meteo.com/v1/forecast", params=params, timeout=aiohttp.ClientTimeout(total=8)
            ) as resp:
                raw = await resp.json()
        current = raw["current"]
        code = current.get("weather_code", 0)
        label, icon = WEATHER_CODES.get(code, ("", ""))
        data = {
            "temperature": round(current["temperature_2m"]),
            "label": label,
            "icon": icon,
            "location": "Akron, OH",
        }
        _weather_cache["data"] = data
        _weather_cache["time"] = now
        return web.json_response(data)
    except Exception:
        # Keep the last good reading rather than showing nothing if Open-Meteo hiccups.
        if _weather_cache["data"]:
            return web.json_response(_weather_cache["data"])
        return web.json_response({"temperature": None, "label": "", "icon": "", "location": "Akron, OH"})


def _stremio_poster(item):
    poster = item.get("poster")
    if poster:
        return poster
    _id = item.get("_id") or ""
    base_id = _id.split(":")[0]
    if base_id.startswith("tt"):
        return f"https://images.metahub.space/poster/medium/{base_id}/img"
    return ""


def _stremio_link(item, state):
    _id = item.get("_id") or ""
    base_id = _id.split(":")[0]
    itype = item.get("type") or "movie"
    link = f"https://web.stremio.com/#/detail/{itype}/{base_id}"
    video_id = state.get("video_id")
    if video_id:
        link += f"/{video_id}"
    return link


async def stremio_library(authkey):
    payload = {"authKey": authkey, "collection": "libraryItem", "all": True}
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{STREMIO_API}/datastoreGet", json=payload,
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            data = await resp.json()
    return data.get("result") or []


async def handle_continue(request):
    """Recently-watched shows/movies from the user's own Stremio account."""
    cfg = load_config()
    if not cfg.get("stremio", {}).get("enabled", True):
        return web.json_response({"enabled": False, "items": []})

    now = time.time()
    if _continue_cache["data"] is not None and now - _continue_cache["time"] < CONTINUE_CACHE_SECONDS:
        return web.json_response(_continue_cache["data"])

    authkey = os.environ.get("STREMIO_AUTHKEY") or load_secrets().get("stremio_authkey")
    if not authkey:
        return web.json_response({"enabled": True, "connected": False, "items": []})

    try:
        lib = await stremio_library(authkey)
        items = []
        for it in lib:
            if it.get("removed") or it.get("temp"):
                continue
            state = it.get("state") or {}
            last = state.get("lastWatched")
            if not last:
                continue
            duration = state.get("duration") or 0
            offset = state.get("timeOffset") or 0
            progress = round(offset / duration * 100) if duration else 0
            progress = max(0, min(100, progress))
            label = ""
            if state.get("season") and state.get("episode"):
                label = f"S{state['season']}:E{state['episode']}"
            items.append({
                "id": it.get("_id"),
                "name": it.get("name") or "Untitled",
                "type": it.get("type"),
                "poster": _stremio_poster(it),
                "progress": progress,
                "label": label,
                "lastWatched": last,
                "link": _stremio_link(it, state),
            })
        items.sort(key=lambda x: x["lastWatched"], reverse=True)
        payload = {"enabled": True, "connected": True, "items": items[:20]}
        _continue_cache["data"] = payload
        _continue_cache["time"] = now
        return web.json_response(payload)
    except Exception as e:
        if _continue_cache["data"] is not None:
            return web.json_response(_continue_cache["data"])
        return web.json_response({"enabled": True, "connected": True, "items": [], "error": str(e)})


async def handle_ws(request):
    ws = web.WebSocketResponse(heartbeat=25)
    await ws.prepare(request)

    role = request.query.get("role", "tv")
    if role == "tv":
        tv_sockets.add(ws)

    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT and role == "remote":
                # Forward button presses from the phone to every connected TV display.
                dead = set()
                for tv in tv_sockets:
                    try:
                        await tv.send_str(msg.data)
                    except Exception:
                        dead.add(tv)
                tv_sockets.difference_update(dead)
            elif msg.type == WSMsgType.ERROR:
                break
    finally:
        tv_sockets.discard(ws)

    return ws


@web.middleware
async def no_cache_middleware(request, handler):
    """Prevent the TV's browser from holding on to a stale CSS/JS copy after an update."""
    response = await handler(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


def create_app():
    app = web.Application(middlewares=[no_cache_middleware])
    app.router.add_get("/", handle_index)
    app.router.add_get("/remote", handle_remote)
    app.router.add_get("/api/config", handle_get_config)
    app.router.add_post("/api/config", handle_post_config)
    app.router.add_get("/api/info", handle_info)
    app.router.add_get("/api/qr", handle_qr)
    app.router.add_get("/api/weather", handle_weather)
    app.router.add_get("/api/continue", handle_continue)
    app.router.add_get("/ws", handle_ws)
    app.router.add_static("/static/", STATIC_DIR, show_index=False)
    return app


if __name__ == "__main__":
    application = create_app()
    print(f"Mike TV running at http://{local_ip()}:{PORT}")
    web.run_app(application, host="0.0.0.0", port=PORT)
