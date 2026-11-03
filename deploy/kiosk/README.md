# Boot straight into Mike TV (kiosk mode) + LG remote

This makes the Proxmox box show the Mike TV UI full-screen on the TV the
moment it powers on — no browser, no typing an address — and lets your LG
remote drive it over the HDMI cable.

There are two layers:

1. **Kiosk** — a minimal X server auto-launches Chromium full-screen at
   `http://localhost:4950`. (`chromium-kiosk.service` + `start-kiosk.sh`)
2. **Remote** — `cec-bridge.py` turns LG-remote presses into arrow/OK/Back
   keystrokes the page already understands. (`cec-bridge.service`)

Mike TV itself (the Python server) should already be installed and running
per `../CONTAINER_SETUP.md`. These steps run on whatever is physically
connected to the TV's HDMI.

---

## About your hardware (read this first)

**The display box must have a real GPU with an HDMI output wired to the TV.**
If Proxmox is a headless server, you either run this on the host's own GPU or,
cleaner, in a container/VM with the GPU passed through (see "GPU in an LXC"
below).

**HDMI-CEC is the catch.** CEC is what lets the *one* LG remote also drive the
box. Most PC graphics cards do **not** carry CEC over HDMI. So, realistically:

- **Best:** a **Pulse-Eight USB-CEC adapter** (~$40). Plug it between nothing
  and a spare USB port; it sits on the HDMI bus and `cec-client` finds it.
  Then the LG remote "just works."
- **If your GPU/motherboard happens to expose CEC**, the same bridge works with
  no adapter.
- **No CEC at all / don't want to buy anything:** use the built-in **phone
  remote** (scan the QR in Settings), or a **$12 USB "air-mouse" remote** whose
  arrow keys work with zero setup. In that case skip `cec-bridge.service`.

---

## 1. Packages

```bash
sudo apt update
sudo apt install -y xserver-xorg xinit x11-xserver-utils \
                    chromium unclutter cec-utils xdotool curl
```

(On some images the browser package is `chromium-browser`.)

## 2. A dedicated kiosk user

```bash
sudo useradd -m -s /bin/bash kiosk
sudo usermod -aG video,input,tty kiosk
```

Let that user start X on a tty:

```bash
echo 'allowed_users=anybody' | sudo tee /etc/X11/Xwrapper.config
echo 'needs_root_rights=yes' | sudo tee -a /etc/X11/Xwrapper.config
```

## 3. Install the services

Assuming the repo lives at `/opt/mike-tv` (adjust paths in the unit files if not):

```bash
sudo cp deploy/kiosk/chromium-kiosk.service /etc/systemd/system/
sudo cp deploy/kiosk/cec-bridge.service    /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now chromium-kiosk
sudo systemctl enable --now cec-bridge        # skip if you're not using CEC
```

The TV should flip to the Mike TV UI within a few seconds. Point the TV's
input at that HDMI port and you're done.

## 4. Check / troubleshoot

```bash
systemctl status chromium-kiosk
systemctl status cec-bridge
journalctl -u chromium-kiosk -b --no-pager | tail -40
```

- **Black screen / X won't start:** confirm the GPU is visible
  (`ls /dev/dri` should list `card0`), and that step 2's Xwrapper edit is in
  place.
- **Remote does nothing:** run `cec-client -l` — it should list an adapter. If
  it lists none, your GPU isn't passing CEC; add the USB-CEC adapter. You can
  watch raw presses with `cec-client -d 8` and press buttons on the LG remote;
  you should see `key pressed: up` etc. Adjust the `KEYMAP` in `cec-bridge.py`
  if your remote reports different names.
- **Wrong HDMI picked for CEC:** `cec-client` talks on the port the adapter is
  on; make sure the adapter shares the HDMI run to the TV.

## GPU in an LXC (the Proxmox-clean way)

Run the kiosk in a privileged LXC with the render/card devices bound in. In the
container's `/etc/pve/lxc/<id>.conf` on the Proxmox host:

```
lxc.cgroup2.devices.allow: c 226:* rwm
lxc.mount.entry: /dev/dri dev/dri none bind,optional,create=dir
lxc.mount.entry: /dev/tty7 dev/tty7 none bind,optional,create=file
```

For the USB-CEC adapter, also pass its USB device through (`lxc.mount.entry`
for the matching `/dev/ttyACM*` or a USB passthrough). Then follow steps 1–4
inside the container.

## Updating

After a `git pull` that changes anything here:

```bash
sudo systemctl restart chromium-kiosk cec-bridge
```
