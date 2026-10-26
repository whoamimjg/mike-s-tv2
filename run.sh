#!/bin/bash
# Quick local start, for testing on a Mac/PC before deploying to Proxmox.
set -e
cd "$(dirname "$0")"
if [ ! -d venv ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt
python3 server.py
