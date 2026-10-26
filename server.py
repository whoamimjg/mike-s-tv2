#!/usr/bin/env python3
"""Mike TV - a private, local home screen for your TV.

Runs as a small local web server. Open it in your TV's browser, or plug a
computer into the TV over HDMI and open it full screen. A phone can act as
a remote control over the same local network.
"""
import json
import socket
import io
from pathlib import Path

from aiohttp import web, WSMsgType
import qrcode

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "config.json"
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
PORT = 4950

# Websocket connections from TV displays, so a phone remote can reach them.
tv_sockets = set()


def load_config():
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


def create_app():
    app = web.Application()
    app.router.add_get("/", handle_index)
    app.router.add_get("/remote", handle_remote)
    app.router.add_get("/api/config", handle_get_config)
    app.router.add_post("/api/config", handle_post_config)
    app.router.add_get("/api/info", handle_info)
    app.router.add_get("/api/qr", handle_qr)
    app.router.add_get("/ws", handle_ws)
    app.router.add_static("/static/", STATIC_DIR, show_index=False)
    return app


if __name__ == "__main__":
    application = create_app()
    print(f"Mike TV running at http://{local_ip()}:{PORT}")
    web.run_app(application, host="0.0.0.0", port=PORT)
