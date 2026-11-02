#!/usr/bin/env python3
"""One-time Stremio login for Mike TV.

Exchanges your Stremio email + password for an authKey and stores ONLY the
authKey in data/secrets.json (which is gitignored). Your password is never
written to disk and never leaves this machine except in the single login call
to Stremio's own server.

Run it on the box that runs Mike TV:

    python3 scripts/stremio_login.py

If the authKey ever stops working (rare), just run it again.
"""
import getpass
import json
import sys
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SECRETS = BASE / "data" / "secrets.json"
LOGIN_URL = "https://api.strem.io/api/login"


def main():
    email = input("Stremio email: ").strip()
    password = getpass.getpass("Stremio password (hidden): ")
    if not email or not password:
        print("Email and password are both required.")
        sys.exit(1)

    body = json.dumps({"type": "Login", "email": email, "password": password}).encode()
    req = urllib.request.Request(
        LOGIN_URL, data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f"Could not reach Stremio: {e}")
        sys.exit(1)

    authkey = (data.get("result") or {}).get("authKey")
    if not authkey:
        err = data.get("error") or data
        print(f"Login failed: {err}")
        sys.exit(1)

    secrets = {}
    if SECRETS.exists():
        try:
            secrets = json.loads(SECRETS.read_text())
        except Exception:
            secrets = {}
    secrets["stremio_authkey"] = authkey
    SECRETS.write_text(json.dumps(secrets, indent=2))
    print(f"Success. Saved authKey to {SECRETS}")
    print("Continue Watching will now populate on the TV within ~2 minutes.")


if __name__ == "__main__":
    main()
