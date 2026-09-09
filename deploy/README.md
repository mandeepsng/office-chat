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
