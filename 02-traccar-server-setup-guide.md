# 02 — Traccar Server Setup Guide (Ubuntu 24.04)

Copy-paste-ready deployment guide for the tracking server described in [01-technical-spec.md](01-technical-spec.md).

**Pinned versions (verified 2026-07-06):** Traccar **6.14.5** · Ubuntu **24.04 LTS** · PostgreSQL 16 (Ubuntu default).
**Verified ports:** GT06 protocol → **5023/tcp** · Teltonika protocol → **5027/tcp** (source: https://www.traccar.org/devices/).

Throughout, replace:

| Placeholder | Meaning | Example |
|---|---|---|
| `track.example.co.ke` | Your server's domain | `track.fleetview.co.ke` |
| `CHANGE_ME_DB_PASS` | PostgreSQL password for the `traccar` user | generate: `openssl rand -base64 24` |
| `YOUR.SERVER.IP` | VPS public IPv4 | `65.21.x.x` |

---

## 1. VPS and DNS

**Sizing (start):** 2 vCPU / 4 GB RAM / 80 GB SSD — comfortably runs Traccar + PostgreSQL + backend for ~1,000 devices. Upgrade vertically (4–8 vCPU / 16 GB) before ~5,000 devices.

**Provider notes:**

| Provider | Notes |
|---|---|
| Hetzner (Germany) | Best price/perf (~€4–8/mo class); ~150–180 ms latency to Kenya — fine, devices buffer and TCP is tolerant |
| Contabo | Cheapest RAM; noisier neighbors — acceptable for pilot |
| AWS af-south-1 (Cape Town) | Lowest latency (~30–50 ms) and best for data-residency optics, ~3–4× the cost — good M3 upgrade path |

Avoid free tiers and NAT'd VPSes: devices need a **stable public IP with open TCP ports**.

**DNS:** create two A records at your DNS host pointing to `YOUR.SERVER.IP`:

```
track.example.co.ke   A   YOUR.SERVER.IP      # Traccar web UI (admin only)
api.example.co.ke     A   YOUR.SERVER.IP      # business backend (M2+)
```

Device configs should use the **hostname**, not the raw IP, so you can migrate servers without re-provisioning SIM-installed devices in the field.

---

## 2. Base system

SSH in as root (or sudo user):

```bash
apt update && apt upgrade -y
apt install -y unzip wget nano ufw
timedatectl set-timezone Africa/Nairobi
```

Create a non-root admin user if you're on root (recommended):

```bash
adduser deploy && usermod -aG sudo deploy
```

---

## 3. PostgreSQL

```bash
sudo apt install -y postgresql
sudo systemctl enable --now postgresql
```

Create the Traccar database and user (and the future backend DB while we're here):

```bash
sudo -u postgres psql <<'SQL'
CREATE USER traccar WITH PASSWORD 'CHANGE_ME_DB_PASS';
CREATE DATABASE traccar OWNER traccar;
CREATE USER app WITH PASSWORD 'CHANGE_ME_APP_DB_PASS';
CREATE DATABASE app OWNER app;
SQL
```

PostgreSQL listens on localhost only by default — leave it that way.

---

## 4. Install Traccar

The official Linux installer bundles its own Java runtime — **no separate Java install is needed** (source: https://www.traccar.org/linux/).

```bash
cd /tmp
wget https://github.com/traccar/traccar/releases/download/v6.14.5/traccar-linux-64-6.14.5.zip
unzip traccar-linux-64-6.14.5.zip
sudo ./traccar.run
```

This installs to `/opt/traccar` and registers a systemd unit. **Don't start it yet** — switch to PostgreSQL first.

### 4.1 Switch from H2 to PostgreSQL

Edit the config:

```bash
sudo nano /opt/traccar/conf/traccar.xml
```

Inside `<properties>`, **replace the existing `database.*` entries** with (keys verified against https://www.traccar.org/postgresql/):

```xml
<entry key='database.driver'>org.postgresql.Driver</entry>
<entry key='database.url'>jdbc:postgresql://localhost:5432/traccar</entry>
<entry key='database.user'>traccar</entry>
<entry key='database.password'>CHANGE_ME_DB_PASS</entry>

<!-- Bind web/API to localhost only; Nginx will front it -->
<entry key='web.address'>127.0.0.1</entry>

<!-- Devices must be pre-registered by IMEI; never auto-create unknown devices -->
<entry key='database.registerUnknown'>false</entry>
```

### 4.2 Start and verify

```bash
sudo systemctl enable --now traccar
sudo systemctl status traccar --no-pager
tail -n 50 /opt/traccar/logs/tracker-server.log
```

Healthy startup shows the protocol servers binding (you'll see many ports including 5023 and 5027) and no database errors. Confirm the two we need:

```bash
sudo ss -tlnp | grep -E ':(5023|5027|8082)'
```

Expected: `5023` (gt06), `5027` (teltonika) on `0.0.0.0`, and `8082` on `127.0.0.1`.

> **Optional hardening:** Traccar opens listeners for all ~200 protocols by default. To disable everything except our two, you can add `<entry key='PROTOCOL.enable'>false</entry>` entries later; for launch, UFW (below) already blocks all other ports externally.

---

## 5. Firewall (UFW)

Allow **only** SSH, HTTP/HTTPS, and the two device ports:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp     # Let's Encrypt HTTP-01 + redirect
sudo ufw allow 443/tcp    # web UI / API over TLS
sudo ufw allow 5023/tcp   # GT06 devices
sudo ufw allow 5027/tcp   # Teltonika devices
sudo ufw enable
sudo ufw status verbose
```

Port 8082 stays closed externally — it's localhost-only behind Nginx.

---

## 6. Nginx reverse proxy + Let's Encrypt TLS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/traccar
```

Paste:

```nginx
server {
    listen 80;
    server_name track.example.co.ke;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket support (live map + our backend's /api/socket)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
```

Enable and get the certificate (certbot rewrites the config for TLS + renewal cron automatically):

```bash
sudo ln -s /etc/nginx/sites-available/traccar /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d track.example.co.ke --redirect -m you@example.com --agree-tos --no-eff-email
```

Browse to `https://track.example.co.ke` — you should see the Traccar login page over TLS.

> **Access control:** once the business backend exists, end users never see this UI. Add an IP allowlist (`allow <office-ip>; deny all;` in the `location` block) or HTTP basic auth in front of it for defense in depth.

---

## 7. First run

1. Log in with the default **admin / admin** and **immediately** change the password (top-right → Account) and the account email.
2. **Add a device:** Devices → `+` → Name: `Pilot GT06 01`, Identifier: the device's **15-digit IMEI** (printed on the unit/box; confirm with `IMEI#` SMS for GT06 or `getimei` for Teltonika). The identifier must exactly match the IMEI the device transmits.
3. Once the device is configured (next section) and powered, it appears **green/online** and drops a marker on the live map. First fix outdoors can take 1–15 min (GPS cold start).

---

## 8. Device provisioning

> **SMS command formats vary by firmware batch.** The sequences below are the standard factory defaults for GT06N (Concox) and Teltonika FMB920. If a command is rejected, check the exact manual for your batch: Concox/Jimi supplier manual for GT06N; https://wiki.teltonika-gps.com/view/FMB920 for Teltonika. Send commands from any phone to the tracker SIM's number.

### 8.0 SIM preparation (both device types)

- Safaricom M2M (or ordinary prepaid for pilot) SIM with an active **data bundle** (30–100 MB/month is enough) and a little airtime for SMS replies.
- SIM must have PIN lock **disabled** (test it in a phone first).
- Record ICCID ↔ MSISDN ↔ device IMEI in your SIM register before installation.

### 8.1 Concox GT06N via SMS

Default SMS password is `666666` on most batches (some commands take no password). Send in this order, waiting for each `OK` reply:

```
APN,safaricom#                              → sets APN (Safaricom default APN, no user/pass)
SERVER,1,track.example.co.ke,5023,0#        → mode 1 = domain name, port 5023, 0 = TCP
TIMER,30#                                   → upload every 30 seconds
GMT,E,3#                                    → timezone UTC+3 (East Africa Time)
RESET#                                      → reboot to apply
```

Verification commands:

```
PARAM#      → replies with current APN/server/timer settings
STATUS#     → battery, GSM signal, GPS state
WHERE#      → replies with coordinates by SMS (also the recovery fallback)
URL#        → replies with a Google Maps link
```

Within ~2 minutes of `RESET#`, the device should show **online** in Traccar.

### 8.2 Teltonika FMB920

**Via SMS:** format is `<login><space><password><space><command>`. With factory-empty SMS login/password, start the SMS with **two spaces**:

```
␣␣setparam 2001:safaricom;2002:;2003:;2004:track.example.co.ke;2005:5027;2006:0
```

(`2001` APN · `2002/2003` APN user/pass, empty · `2004` server host · `2005` port **5027** · `2006` protocol, 0 = TCP)

```
␣␣cpureset            → reboot to apply
␣␣getinfo             → firmware, GSM, records queued
␣␣getgps              → current fix by SMS
```

**Via Teltonika Configurator (preferred for batches):** connect over USB, Windows Configurator app → *GPRS* tab: APN `safaricom`, Domain `track.example.co.ke`, Port `5027`, Protocol TCP → *Data Acquisition* tab: On Moving — Min Period 30 s, Min Distance 100 m; On Stop — Min Period 300 s → *Features* → enable **Jamming detection** and **Towing detection** (premium-tier differentiators) → Save to device.

### 8.3 Relay wiring for engine cut-off (reference only)

**Have a qualified auto-electrician install this.** Wrong wiring can disable a vehicle in traffic or start a fire; installer liability is covered in the business plan's ops section.

- Use the tracker's output wire (GT06N: yellow relay-control wire; FMB920: **DOUT1**, typically yellow — confirm per model datasheet) to drive an automotive relay (12 V, 20–40 A, e.g. Bosch-style 5-pin).
- Interrupt the **fuel pump supply** (preferred: vehicle stops gently as fuel runs out of the line) or the **starter-motor trigger** (safest: vehicle can't start but never dies while moving). **Never cut the main ignition/ECU feed on a moving vehicle.**
- Normally-closed wiring through relay pins 30/87a so the vehicle runs normally when the tracker is unpowered — a dead tracker must not strand the customer.
- Test protocol after install: cut + restore with engine off; then verify vehicle starts; log the test in the installer job.
- Command check: GT06N — `RELAY,1#` (cut) / `RELAY,0#` (restore); FMB920 — `␣␣setdigout 1` / `␣␣setdigout 0`. In production these are sent by the backend via Traccar (`engineStop` / `engineResume`), with SMS as fallback.

---

## 9. Notifications and geofences (Traccar UI — pilot phase)

Until the backend takes over alerting (M2), configure directly in Traccar:

1. **Server-level events:** Settings → Notifications → `+` → Type: *Alarm*, Channels: *Web* (+ *Mail* if SMTP configured). Repeat for *Device offline*, *Geofence entered/exited*, *Overspeed*.
2. **Overspeed limit:** Settings → Server (or per-device Attributes) → add attribute `speedLimit` (value in knots; 80 km/h ≈ **43.2** — Traccar uses knots internally).
3. **Geofence:** Map → Geofences (pencil icon) → draw circle/polygon (e.g., around the owner's home) → Save → link it to the device (Device → ⋯ → Geofences).
4. Alarm events from GT06/Teltonika (power cut, vibration, SOS, jamming on Teltonika) arrive automatically once notifications are on.

---

## 10. Operations

### 10.1 Nightly database backup

```bash
sudo mkdir -p /var/backups/tracker && sudo chown postgres /var/backups/tracker
sudo crontab -u postgres -e
```

Add:

```cron
15 2 * * * pg_dump -Fc traccar > /var/backups/tracker/traccar_$(date +\%F).dump && pg_dump -Fc app > /var/backups/tracker/app_$(date +\%F).dump && find /var/backups/tracker -name '*.dump' -mtime +30 -delete
```

Ship backups **off the VPS** (e.g., `rclone` to Backblaze B2/S3 in a second cron entry at 03:00). A backup on the same disk is not a backup.

Restore test (quarterly): `pg_restore -d traccar_test /var/backups/tracker/traccar_YYYY-MM-DD.dump`.

### 10.2 Logs

Traccar writes to `/opt/traccar/logs/tracker-server.log` and **rotates daily by itself** (dated files). Add a safety-net cleanup:

```bash
echo '0 4 * * * root find /opt/traccar/logs -name "tracker-server.log.*" -mtime +14 -delete' | sudo tee /etc/cron.d/traccar-logclean
```

Nginx logs are handled by the stock `logrotate` config.

### 10.3 Upgrades

```bash
# 1. Backup first (run the pg_dump line above manually)
sudo systemctl stop traccar
cd /tmp && wget https://github.com/traccar/traccar/releases/download/vNEW/traccar-linux-64-NEW.zip
unzip traccar-linux-64-NEW.zip && sudo ./traccar.run   # installer upgrades in place, keeps conf/
sudo systemctl start traccar
tail -f /opt/traccar/logs/tracker-server.log            # watch schema migration complete
```

`traccar.xml` is preserved; still, keep a copy in your ops repo. Read the release notes before major-version jumps.

### 10.4 Monitoring (minimum viable)

```bash
# Service watchdog: auto-restart on crash
sudo systemctl edit traccar
```

Add:

```ini
[Service]
Restart=on-failure
RestartSec=10
```

- **Disk:** `df -h` weekly, or `echo '0 8 * * * root df -h / | tail -1' | sudo tee /etc/cron.d/diskcheck` mailed via cron's MAILTO. Positions grow ~1–2 GB/month per 100 devices at 30 s intervals.
- **External uptime:** free tier of UptimeRobot/Better Uptime pinging `https://track.example.co.ke` every 5 min → SMS/email on failure. Also add a TCP check on port 5023 — the web UI can be up while ingest is down.
- **Device-level:** Traccar's own *Device offline* notification is your fleet heartbeat during pilot.

---

## 11. Troubleshooting

### 11.1 "Device offline" checklist — in this order

| # | Check | How |
|---|---|---|
| 1 | SIM has airtime **and data bundle** | Insert SIM in a phone: `*144#` (Safaricom balance), `*544#` (bundles). No data = no tracking. This is the cause ~70 % of the time |
| 2 | APN correct | GT06: `PARAM#` shows APN — must be `safaricom`. Teltonika: `␣␣getinfo` |
| 3 | IMEI mismatch | Traccar device Identifier must equal the transmitting IMEI. Watch the live log: `tail -f /opt/traccar/logs/tracker-server.log \| grep -i 'unknown device'` — an "unknown device" line shows the IMEI actually being sent; fix the identifier |
| 4 | Server/port config on device | GT06 `PARAM#` / Teltonika `getinfo`: host `track.example.co.ke`, port 5023/5027, TCP |
| 5 | Port reachable from outside | From your laptop: `Test-NetConnection track.example.co.ke -Port 5023` (PowerShell) or `nc -vz track.example.co.ke 5023`. If closed: `sudo ufw status`, `sudo ss -tlnp \| grep 5023` |
| 6 | GPS cold start | Device online (GSM) but no position: move outdoors, wait up to 15 min. GT06 `STATUS#` shows GPS state |
| 7 | Power | Hardwired units: check fuse/connections; battery units (FMT100): charge level via `STATUS#`/`getinfo` |

### 11.2 Duplicate IMEIs

Two devices with the same Identifier corrupt each other's history (positions interleave). Traccar refuses duplicate identifiers within one server, but cloned/counterfeit GT06 units in the wild sometimes share a real IMEI. Symptoms: a device "teleporting" between two areas. Fix: verify each unit's IMEI by SMS (`IMEI#`), and buy from suppliers who provide IMEI lists per carton; reject cartons with duplicates.

### 11.3 Device time drift

Cheap GT06 clones may report wrong timestamps (bad RTC/timezone), making positions appear hours old or in the future — trips look empty because you're querying the wrong window. Fixes: send `GMT,E,3#` (device should report UTC or correct offset per its manual); verify in the log which `time` vs `serverTime` Traccar records; as a last resort, per-device attribute `useServerTime = true` in Traccar makes the server timestamp authoritative.

### 11.4 Useful log greps

```bash
grep -i 'unknown device' /opt/traccar/logs/tracker-server.log   # unregistered IMEIs knocking
grep -i 'error'          /opt/traccar/logs/tracker-server.log | tail -20
sudo journalctl -u traccar -n 50 --no-pager                     # service-level failures (DB down etc.)
```

---

## 12. Sources & assumptions

**Verified 2026-07-06:** installer & service management — traccar.org/linux · release 6.14.5 — traccar.org/download · PostgreSQL keys — traccar.org/postgresql · ports 5023/5027 — traccar.org/devices.

**Assumptions:** GT06N SMS password `666666` and command set per standard Concox firmware (varies on clones — always test one unit per purchased batch before bulk provisioning); FMB920 SMS login/password factory-empty (two-space prefix); Safaricom APN `safaricom` with no username/password (standard for prepaid/M2M); relay guidance is reference-only, professional installation mandatory.
