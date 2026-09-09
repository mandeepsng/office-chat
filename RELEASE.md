# OfficeChat — Release & Deployment Runbook

Server restart, naya code deploy, aur desktop auto-update ka poora flow — ready-to-follow commands ke saath.

| Cheez | Value |
|---|---|
| VPS path | `/var/www/html/office-chat` |
| PM2 app name | `officechat` |
| Server port | `8787` |
| Public URL | `http://206.189.131.217:8787` (health: `/health`) |
| WebSocket URL | `ws://206.189.131.217:8787` |
| GitHub repo | `mandeepsng/office-chat` |
| DB file (VPS) | `apps/server/data/officechat.db` |

---

## 1. Server (VPS) — Restart & Deploy

SSH karke VPS pe jao, phir project folder mein:

```bash
cd /var/www/html/office-chat
```

### 1a. Sirf restart (code change nahi kiya)

```bash
pm2 restart officechat
pm2 logs officechat --lines 30      # verify (Ctrl+C se bahar niklo)
```

### 1b. Naya code deploy (GitHub se latest)

```bash
cd /var/www/html/office-chat
git pull                 # latest changes lao
pnpm install             # naye dependencies (na ho to skip ho jayega)
pm2 restart officechat   # naya code load karo
pm2 logs officechat --lines 30
```

> Server ka DB schema pehli baar start pe khud ban jaata hai (migrations). Alag se kuch nahi karna.

### 1c. Verify server chal raha hai

```bash
curl http://localhost:8787/health          # VPS ke andar se
# Response: {"status":"ok"}
```

Bahar se (apne Windows browser mein):
```
http://206.189.131.217:8787/health
```
Agar bahar se nahi khulta → firewall port block kar raha hai:
```bash
ufw allow 8787
ufw status
```

### 1d. PM2 status / logs

```bash
pm2 list                 # sab apps ka status
pm2 logs officechat      # live logs
pm2 restart officechat   # restart
pm2 stop officechat      # rokna
pm2 start officechat     # chalu karna
```

### 1e. DB reset (fresh start — saare users/messages chale jaayenge)

⚠️ **Destructive** — sirf tab jab sach mein sab data wipe karna ho.

```bash
cd /var/www/html/office-chat
pm2 stop officechat                          # DB lock chhoot jaye
rm -f apps/server/data/officechat.db \
      apps/server/data/officechat.db-shm \
      apps/server/data/officechat.db-wal
pm2 start officechat                          # fresh DB ban jayega
```

> **Port already in use (`EADDRINUSE`)** aaye to matlab server pehle se chal raha hai. `dev` mat chalao — `pm2 restart officechat` use karo. Kaun port pakde hai dekhne ke liye: `ss -ltnp | grep 8787`

### 1f. Local DB reset (Windows dev machine)

Local dev pe DB `apps/server/data/officechat.db` hai. Pehle local server (jo `pnpm --filter server dev` se chal raha ho) band karo, phir:

```powershell
# PowerShell (Windows)
# 1. Dev server ka terminal band karo (Ctrl+C), ya port 8787 wala process kill karo:
#    netstat -ano | findstr 8787   ->  PID mila to:  taskkill /PID <PID> /F
# 2. DB files delete:
Remove-Item apps/server/data/officechat.db, `
            apps/server/data/officechat.db-shm, `
            apps/server/data/officechat.db-wal -Force -ErrorAction SilentlyContinue
# 3. Server dobara chalao -> fresh DB migrations se ban jayega:
pnpm --filter server dev
```

> Agar `Device or resource busy` / file locked aaye → server abhi chal raha hai. Pehle use band karo.

---

## 1.5 Database — Schema Changes

Is project mein migrations ek hi idempotent block hai: `apps/server/src/db/migrations.ts` (`CREATE TABLE IF NOT EXISTS ...`). Full migration framework jaanbujh ke nahi rakha (5-20 users ke liye over-engineering). Isliye schema badalne ke 3 cases:

### A. Naya TABLE add karna — automatic ✅

`migrations.ts` mein ek aur `CREATE TABLE IF NOT EXISTS ...` block jodo. Server restart pe khud ban jayega. **DB reset ki zaroorat nahi.**

```ts
// migrations.ts ke db.exec(`...`) block ke andar:
CREATE TABLE IF NOT EXISTS reactions (
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
```

### B. Existing table mein naya COLUMN add karna — guard chahiye ⚠️

`CREATE TABLE IF NOT EXISTS` **existing table ko change nahi karta**. Naye column ke liye `ALTER TABLE` chahiye — par woh dobara chalne pe fail ho jayega (column already exists). Isliye ek guard use karo taaki idempotent rahe (DB reset ke bina, purana data safe).

`migrations.ts` mein `runMigrations` ke andar, `db.exec(...)` ke **baad** yeh add karo:

```ts
// Helper — ek baar file mein rakho
function columnExists(db: DB, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

// Naya column safely add karo (idempotent):
if (!columnExists(db, "users", "status")) {
  db.exec(`ALTER TABLE users ADD COLUMN status TEXT`);
}
```

- Column ki default value chahiye to: `ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`
- Yeh purana data **bina wipe kiye** kaam karta hai. Deploy: `git pull && pnpm install && pm2 restart officechat`

### C. Zero se shuru (from scratch) — sab wipe 💥

Bade schema changes (column type badalna, constraints, rename) ke liye guard likhne se aasan hai poora DB reset karna — **agar data important nahi hai** (dev / testing):

**VPS:** upar section **1e** dekho.
**Local:** upar section **1f** dekho.

Reset ke baad `migrations.ts` ka poora naya schema fresh ban jayega. (Production pe jahan real data ho, wahan case B — guarded `ALTER TABLE` — use karo, wipe nahi.)

### Kaunsa case kab

| Change | Kya karo | DB reset? |
|---|---|---|
| Naya table | `CREATE TABLE IF NOT EXISTS` add karo | Nahi |
| Naya column (data rakhna hai) | Guarded `ALTER TABLE` (case B) | Nahi |
| Column type/constraint badalna | Dev: reset (case C) · Prod: careful ALTER | Dev: Haan |
| Sab kuch fresh (dev/testing) | Reset (case C) | Haan |

---

## 2. Desktop — Build & Config

### 2a. Server URL set karna

Desktop app ka WebSocket URL **build-time pe bake** hota hai. Do jagah set hota hai:

- **Local build ke liye:** `apps/desktop/.env`
  ```
  VITE_WS_URL=ws://206.189.131.217:8787
  ```
- **CI (GitHub Actions) build ke liye:** repo → Settings → Secrets and variables → Actions → **Variables** → `VITE_WS_URL = ws://206.189.131.217:8787`

> URL badalne ke baad **hamesha rebuild** zaroori hai. Sirf installer dobara chalane se URL nahi badalta.

### 2b. Local build

```bash
pnpm install
pnpm --filter desktop tauri build
```

Installer yahan banega:
```
apps/desktop/src-tauri/target/release/bundle/
```

---

## 3. Auto-Update — Full Flow

App **har launch pe** GitHub Releases check karti hai. Naya signed version mile to khud download → install → relaunch.

### 3a. One-time setup (sirf ek baar)

1. **Signing private key ko GitHub Secret banao:**
   - repo → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `TAURI_SIGNING_PRIVATE_KEY` → Value: private key file ka poora content
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` → khaali (bina password ki key hai)

2. **Public key** already `apps/desktop/src-tauri/tauri.conf.json` mein `plugins.updater.pubkey` mein set hai.

3. **Updater endpoint** already set hai:
   ```
   https://github.com/mandeepsng/office-chat/releases/latest/download/latest.json
   ```

> ⚠️ Private key kho gayi to future updates sign nahi honge. Ek safe backup rakho.

### 3b. Naya update release karna (har baar yeh 5 steps)

**Step 1 — Version bump.** `apps/desktop/src-tauri/tauri.conf.json`:
```json
"version": "0.1.1"
```
(agli baar `0.1.2`, `0.1.3`... — version hamesha badhna chahiye warna updater offer nahi karega)

**Step 2 — Commit:**
```bash
git add -A
git commit -m "Release v0.1.1"
git push origin main
```

**Step 3 — Tag push (yahi CI trigger karta hai):**
```bash
git tag v0.1.1
git push origin v0.1.1
```

**Step 4 — CI build hone do.** GitHub → Actions tab. `Build Desktop` workflow teeno platforms (Windows/macOS/Linux) build karega, signed artifacts + `latest.json` banayega, aur ek **draft release** create karega. (~15-25 min)

**Step 5 — Draft release Publish karo.** ⚠️ **Zaroori step.**
- GitHub → Releases → draft release (`OfficeChat v0.1.1`) → Edit → **Publish release**
- `releases/latest/download/latest.json` sirf **published** (draft/prerelease nahi) latest release pe kaam karta hai.

Bas! Ab sabhi installed apps agli baar khulte hi khud update ho jaayengi.

### 3c. User ki app pe kya hota hai

```
App khulti hai
   ↓
GitHub Releases check (latest.json)
   ↓
Naya version mila? ── Nahi → normal chalu
   ↓ Haan
Signed installer download
   ↓
Signature verify (public key se)
   ↓
Install + relaunch → naya version chalu
```

### 3d. Zaroori caveats

- **Baseline build:** Auto-update tabhi kaam karega jab user ke paas **updater-enabled build** (yeh wali ya baad ki) install ho. Sabse pehle ek baar sabko naya build **manually** bhejo — uske baad se sab automatic.
- **Draft publish:** Har release ko manually **Publish** karna padta hai (abhi `releaseDraft: true` hai). Chaho to `.github/workflows/build.yml` mein `releaseDraft: false` karke auto-publish kar sakte ho — par tab galat build bhi turant sabko chala jayega. Draft safer hai.
- **Linux:** Auto-update sirf **AppImage** pe kaam karta hai, `.deb`/`.rpm` pe nahi. Linux users ko AppImage baanto.
- **Windows/macOS proper install:** notifications + update proper dikhne ke liye installer se install karo, portable `.exe`/dev se nahi.

---

## 4. Quick Troubleshooting

| Problem | Wajah / Fix |
|---|---|
| `EADDRINUSE: 8787` | Server already chal raha hai. `dev` mat chalao → `pm2 restart officechat` |
| App "Can't reach the server" | Baked URL galat ya server down. `.env`/repo Variable check karo, `curl .../health`, phir rebuild |
| Health bahar se nahi khulta | Firewall: `ufw allow 8787` |
| Auto-update nahi ho raha | Release **published** hai? version badha? user ke paas baseline build hai? |
| Update signature error | GitHub secret `TAURI_SIGNING_PRIVATE_KEY` galat/missing, ya pubkey mismatch |
| Black console window (Windows) | Fixed — installer se install karo (dev se nahi) |
| Notification click chat nahi kholta | Linux daemon click callback nahi deta (OS limitation); Windows/macOS pe kaam karta hai |

---

## 5. Version Bump Checklist (copy-paste)

```bash
# 1. version badhao: apps/desktop/src-tauri/tauri.conf.json  ->  "version": "0.1.X"

# 2. commit + push
git add -A && git commit -m "Release v0.1.X" && git push origin main

# 3. tag push (CI trigger)
git tag v0.1.X && git push origin v0.1.X

# 4. GitHub Actions -> build complete hone do

# 5. GitHub Releases -> draft ko PUBLISH karo

# Done. Users auto-update ho jaayenge.
```
