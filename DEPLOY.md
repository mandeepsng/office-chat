Perfect, ab main aapko poora VPS deployment ka step-by-step de deta hoon. Aapka server setup simple hai — tsx se TypeScript directly chalta hai (koi build step nahi), port 8787, aur SQLite file-based DB. Isliye deployment kaafi halka hai.

Kaha deploy karein (VPS options)
Small office (5–20 users) ke liye sabse sasta/reliable:

Provider	Plan	Approx price
Hetzner (recommended)	CX22 (2 vCPU, 4GB)	~€4/mo
DigitalOcean	Basic Droplet 1GB	$6/mo
Contabo / Linode / Vultr	1–2GB RAM	$5–6/mo
Ubuntu 22.04 / 24.04 LTS choose karein. 1GB RAM bhi kaafi hai (server target <100MB RAM hai).

Step 1 — VPS pe basic setup
SSH se login karke:


# System update
sudo apt update && sudo apt upgrade -y

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
sudo npm install -g pnpm pm2

# better-sqlite3 ko compile karne ke liye build tools zaroori hain
sudo apt install -y build-essential python3 git
Step 2 — Code deploy karein

# Apne repo ko clone karein (ya git push karke)
cd /opt
sudo git clone <your-repo-url> office-chat
sudo chown -R $USER:$USER office-chat
cd office-chat

# Dependencies (native better-sqlite3 yahin compile hoga)
pnpm install
Step 3 — Production .env banayein

nano apps/server/.env

PORT=8787
HOST=127.0.0.1
OFFICE_CODE=YourRealSecretCode
DATABASE_PATH=/opt/office-chat/data/officechat.db
LOG_MESSAGE_CONTENT=false
NODE_ENV=production
Zaroori: HOST=127.0.0.1 rakhein taaki server sirf localhost pe sune — bahar se access Nginx ke through WSS pe hi ho. OFFICE_CODE change karna mat bhoolein.

Step 4 — PM2 se chalayein (auto-restart + boot pe start)

cd /opt/office-chat
pm2 start "pnpm --filter @office-chat/server start" --name officechat

pm2 save
pm2 startup   # jo command output me aaye use sudo ke saath chala dein
Check: pm2 logs officechat → OfficeChat server listening... dikhna chahiye.

Step 5 — Nginx + HTTPS/WSS (production ke liye must)
Desktop app wss:// use karta hai, isliye SSL zaroori hai. Ek domain (e.g. chat.example.com) ka A-record apne VPS IP pe point karein, phir:


sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/officechat

server {
    listen 80;
    server_name chat.example.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;   # WebSocket long-lived connection
    }
}

sudo ln -s /etc/nginx/sites-available/officechat /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Auto SSL certificate (Let's Encrypt) — HTTP ko HTTPS/WSS bana dega
sudo certbot --nginx -d chat.example.com
Step 6 — Firewall

sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
Step 7 — Desktop app ko point karein
apps/desktop/.env me (jo aapne abhi IDE me khola hai):


VITE_WS_URL=wss://chat.example.com
Phir desktop build karein: pnpm --filter desktop tauri build.

Verify

curl https://chat.example.com/health   # {"status":"ok"} aana chahiye
Future updates deploy karne ka flow

cd /opt/office-chat && git pull && pnpm install && pm2 restart officechat
Kuch cheezein clarify kar dun:

PM2 vs systemd — Maine PM2 recommend kiya (simple, logs + restart built-in). CLAUDE.md me systemd bhi mention hai; agar aap prefer karein to systemd unit file bhi bana sakta hoon.
SQLite backup — /opt/office-chat/data/officechat.db ka daily cron backup laga dena chahiye. Chahein to setup kar dun.
