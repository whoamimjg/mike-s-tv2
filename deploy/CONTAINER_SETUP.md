# Deploying to the Proxmox LXC container

Run these once the container is created and has network access (DHCP on vmbr0 is fine).

```bash
apt update && apt install -y python3-venv python3-pip git

git clone <your-github-repo-url> /opt/mike-tv
cd /opt/mike-tv
python3 -m venv venv
./venv/bin/pip install -r requirements.txt

cp deploy/mike-tv.service /etc/systemd/system/mike-tv.service
systemctl daemon-reload
systemctl enable --now mike-tv

# Confirm it's running and find the container's LAN IP:
systemctl status mike-tv
ip addr show | grep inet
```

Point the TV's browser (or an HDMI-connected computer) at:

```
http://<container-ip>:4950
```

## Updating later

```bash
cd /opt/mike-tv
git pull
systemctl restart mike-tv
```
