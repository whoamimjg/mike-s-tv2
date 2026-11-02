#!/usr/bin/env python3
"""Bridge LG-remote button presses (HDMI-CEC) into keystrokes for the kiosk.

The TV sends remote navigation keys over HDMI-CEC to the "active source".
This script makes the Proxmox box the active source via cec-client, watches
for key presses, and replays them as keyboard events with xdotool. The kiosk
page already understands arrows / Enter / Escape, so nothing else is needed.

Works with CEC provided by the GPU *or* a USB-CEC adapter (Pulse-Eight);
cec-client auto-detects whichever is present.

Requires on the host:   apt install -y cec-utils xdotool
Run under the same X DISPLAY as the kiosk (see cec-bridge.service).
"""
import os
import re
import subprocess
import time

os.environ.setdefault("DISPLAY", ":0")

# cec-client key name  ->  X key sent to the browser
KEYMAP = {
    "up": "Up",
    "down": "Down",
    "left": "Left",
    "right": "Right",
    "select": "Return",
    "enter": "Return",
    "ok": "Return",
    "exit": "Escape",
    "back": "Escape",
    "return": "Escape",
    "root menu": "s",       # LG "Home"/menu -> open our Settings
    "contents menu": "s",
    "F1": "s",              # blue key -> Settings
}

KEY_RE = re.compile(r"key pressed:\s*([a-z0-9 ]+?)\s*\(", re.IGNORECASE)


def send_key(xkey):
    try:
        subprocess.run(["xdotool", "key", "--clearmodifiers", xkey], check=False)
    except FileNotFoundError:
        print("xdotool not installed (apt install xdotool)")


def run_once():
    proc = subprocess.Popen(
        ["cec-client", "-d", "8"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, bufsize=1,
    )
    # Become the active source so the TV forwards remote keys to us.
    try:
        proc.stdin.write("as\n")
        proc.stdin.flush()
    except Exception:
        pass

    for line in proc.stdout:
        if "key pressed" not in line.lower():
            continue
        m = KEY_RE.search(line)
        if not m:
            continue
        name = m.group(1).strip().lower()
        xkey = KEYMAP.get(name)
        if xkey:
            send_key(xkey)


def main():
    while True:
        try:
            run_once()
        except FileNotFoundError:
            print("cec-client not found. Install with: apt install -y cec-utils")
            return
        except Exception as e:
            print(f"cec-bridge restarting after error: {e}")
        time.sleep(5)  # cec-client exited (adapter unplugged?): wait and retry


if __name__ == "__main__":
    main()
