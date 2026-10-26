#!/usr/bin/env python3
"""Mike TV - a private, local home screen for your TV.

Runs as a small local web server. Open it in your TV's browser, or plug a
computer into the TV over HDMI and open it full screen. A phone can act as
a remote control over the same local network.
"""
import json
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
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
PORT = 4950

# Akron, OH. Change these if you move, or we can make this a Settings field later.
WEATHER_LAT = 41.0814
WEATHER_LON = -81.5190
WEATHER_TIMEZONE = "America/New_York"
WEATHER_CACHE_SECONDS = 600  # Open-Meteo is free/keyless; still no need to hit it every page load.

# Websocket connections from TV displays, so a phone remote can reach them.
tv_sockets = set()

_weather_cache = {"time": 0, "data": None}

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


def load_config():
    if not DATA_FILE.exists():
        # First run on this machine: start from the shipped defaults.
        # config.json itself is gitignored, so your own settings here
        # never get overwritten by a later `git pull`.
        DATA_FILE.write_text(EXAMPLE_FILE.read_text())
    with open(DATA_FILE) as f:
        return json.load(f)


def save_config(cfg):
    tmp = DATA_FILE.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(cfg, f, indent=2)
    tmp.replace(DATA_FILE)


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
    app.router.add_get("/ws", handle_ws)
    app.router.add_static("/static/", STATIC_DIR, show_index=False)
    return app


if __name__ == "__main__":
    application = create_app()
    print(f"Mike TV running at http://{local_ip()}:{PORT}")
    web.run_app(application, host="0.0.0.0", port=PORT)
