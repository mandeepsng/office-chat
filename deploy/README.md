# Deploying OfficeChat to a VPS

Everything here targets **Ubuntu 22.04 / 24.04**. The server is tiny — Node +
`tsx` running `apps/server`, with a file-based SQLite DB. No build step, no
Docker required.

## Files

| File | Purpose |
|---|---|
| `setup.sh` | One-time VPS provisioning (Node 22, pnpm, PM2, build tools). |
| `deploy.sh` | Install deps + start/restart the server under PM2. Re-run for updates. |
| `officechat.service` | systemd unit — use **instead of** PM2 if you prefer. |
| `nginx.conf` | Reverse proxy for HTTPS/WSS. |
| `backup.sh` | Daily SQLite snapshot with 14-day retention. |

## Quick start (PM2 path)

```bash
# 1. On the VPS, provision the machine
sudo git clone <your-repo-url> /opt/office-chat
sudo chown -R $USER:$USER /opt/office-chat
cd /opt/office-chat
bash deploy/setup.sh

# 2. Create the server env file
cp .env.example apps/server/.env
nano apps/server/.env          # set OFFICE_CODE, HOST=127.0.0.1,
                               # DATABASE_PATH=/opt/office-chat/data/officechat.db,
                               # NODE_ENV=production

# 3. Deploy
bash deploy/deploy.sh          # follow the one-time `pm2 startup` hint it prints
```

## HTTPS / WSS

Point a domain's A-record at the VPS IP, then:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/officechat
# edit chat.example.com -> your domain
sudo ln -s /etc/nginx/sites-available/officechat /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d chat.example.com

sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

Then set the desktop app's `apps/desktop/.env`:

```env
VITE_WS_URL=wss://chat.example.com
```

Verify:  `curl https://chat.example.com/health`  →  `{"status":"ok"}`

## Logs — where everything shows up

The server writes `[INFO] / [WARN] / [ERROR]` to stdout/stderr. Depending on
how you run it and which layer the problem is in, logs land in different files:

| What | Log location | View command |
|---|---|---|
| Server logs (PM2) | `~/.pm2/logs/officechat-out.log` | `pm2 logs officechat` |
| Server errors / crashes (PM2) | `~/.pm2/logs/officechat-error.log` | `pm2 logs officechat --err` |
| Server logs (if using systemd) | systemd journal | `journalctl -u officechat -f` |
| Connection / WSS problems | `/var/log/nginx/error.log` | `sudo tail -f /var/log/nginx/error.log` |
| Who connected / requests | `/var/log/nginx/access.log` | `sudo tail -f /var/log/nginx/access.log` |
| Backup job | `/var/log/officechat-backup.log` | `tail -f /var/log/officechat-backup.log` |

Quick rules of thumb:

- **App crashing / restarting?** → `pm2 logs officechat --err`, and check the
  restart counter with `pm2 status`.
- **Desktop app won't connect?** → the server is probably fine; look in
  `/var/log/nginx/error.log` (SSL/WSS upgrade issues live there).
- **Backup didn't run?** → `/var/log/officechat-backup.log`.

`deploy.sh` auto-configures `pm2-logrotate` (10M per file, 14 rotations,
gzip-compressed) so `~/.pm2/logs/` never fills the disk. Nginx logs are rotated
by the system's own `logrotate` by default.

### Hard 150 MB cap

`pm2-logrotate` handles normal rotation, but `clean-logs.sh` enforces an
absolute ceiling: if `~/.pm2/logs/` ever grows past **150 MB** it deletes the
rotated history and, if still over, flushes the active logs. Schedule it hourly:

```bash
crontab -e
0 * * * *  /opt/office-chat/deploy/clean-logs.sh >> /var/log/officechat-cleanlogs.log 2>&1
```

Change the limit with an env var if needed, e.g. `LOG_LIMIT_MB=300`.

> Note: message **content** is not logged in production (`LOG_MESSAGE_CONTENT=false`).
> Only events are logged, for privacy.

## Crash / restart handling

The server runs under PM2 via `deploy/ecosystem.config.cjs`, which covers every
"server band ho gaya" case:

| Situation | What happens |
|---|---|
| App crashes / throws | PM2 auto-restarts it (smart backoff: 2s, 4s, 8s…) |
| Memory leak | Restarted automatically past 300 MB (`max_memory_restart`) |
| VPS reboots | Comes back on boot — **if** you ran `pm2 startup` once (deploy.sh prompts) |
| You deploy an update | `pm2 reload` = zero-downtime restart |

Manual controls:

```bash
pm2 status                 # is it up? how many restarts?
pm2 restart officechat     # force a restart
pm2 stop officechat        # stop
pm2 logs officechat --err  # why did it crash?
```

> Crash-loop guard: if it dies within 10s repeatedly, PM2 backs off instead of
> hammering. Check `pm2 logs officechat --err` — a config/DB error usually needs
> a fix, not just a restart.

## Updating later

```bash
cd /opt/office-chat && bash deploy/deploy.sh
```

## Backups

Needs the sqlite3 CLI:  `sudo apt install -y sqlite3`

```bash
crontab -e
# runs daily at 3am
0 3 * * *  /opt/office-chat/deploy/backup.sh >> /var/log/officechat-backup.log 2>&1
```

## systemd instead of PM2

If you'd rather not use PM2, skip `deploy.sh`'s PM2 step and instead:

```bash
sudo useradd -r -s /usr/sbin/nologin officechat || true
sudo chown -R officechat:officechat /opt/office-chat
sudo cp deploy/officechat.service /etc/systemd/system/officechat.service
# edit User/WorkingDirectory/ExecStart paths if needed (check: which pnpm)
sudo systemctl daemon-reload
sudo systemctl enable --now officechat
journalctl -u officechat -f
```

Still run `pnpm install --frozen-lockfile` once before starting the service.
