# AGENTS.md — Instructions for AI Agents (Codex / Operator Agents)

This file is for AI coding agents (Codex, Claude, etc.) assisting with this project, particularly for **VM deployment and infrastructure tasks**.

## What this project is

HomeApp ("Hearth") is a private, self-hosted family life hub. Two users: Dan and Imogen. It is a Next.js app backed by SQLite, deployed via Docker Compose on a personal VM, served via Caddy reverse proxy.

---

## VM deployment checklist

This section describes what needs to happen on the VM to go from a fresh server to a running application. **Do not run these steps locally.**

### 1. Prerequisites (run once on the VM)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group to take effect

# Install Docker Compose plugin (if not bundled)
sudo apt-get install docker-compose-plugin

# Confirm
docker --version
docker compose version
```

### 2. Clone the repository

```bash
git clone <your-repo-url> ~/homeapp
cd ~/homeapp
```

### 3. Configure environment variables

```bash
cp .env.example .env
nano .env  # or vim .env
```

Required fields before first launch:
- `NEXT_PUBLIC_APP_URL` — your domain (e.g., `https://home.yourdomain.com`)
- `SESSION_SECRET` — generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — for magic link emails
- Update `Caddyfile`: replace `your-domain.com` with your actual domain

### 4. Configure Caddyfile

```bash
nano Caddyfile
# Replace: your-domain.com  →  home.yourdomain.com
# Replace: www.your-domain.com  →  www.home.yourdomain.com
```

### 5. Make backup script executable

```bash
chmod +x scripts/backup.sh
```

### 6. Build and start

```bash
docker compose build
docker compose up -d
```

### 7. Verify

```bash
# Check all containers are running
docker compose ps

# Check app health
curl http://localhost:3000/api/health

# Check logs
docker compose logs app --tail=50
docker compose logs caddy --tail=20
```

### 8. Set up off-site backup (recommended)

Install rclone on the VM, configure a remote (e.g., Backblaze B2 or Cloudflare R2), then set in `.env`:
```
RCLONE_REMOTE=r2
RCLONE_BUCKET=homeapp-backups
```

Restart the backup container:
```bash
docker compose restart backup
```

---

## Ongoing operations

### Deploy an update

```bash
git pull
docker compose build app
docker compose up -d --no-deps app
```

### View logs

```bash
docker compose logs -f app        # App logs
docker compose logs -f caddy      # Proxy logs
docker compose logs -f backup     # Backup logs
```

### Run DB migrations manually

```bash
docker compose exec app node -e "require('./lib/db/migrate').runMigrations()"
```

### Manual backup

```bash
docker compose exec backup sh /scripts/backup.sh
```

### Restore from backup

```bash
# Stop the app
docker compose stop app

# Copy backup file over the live DB
docker compose run --rm -v homeapp_db_data:/data/db alpine \
  cp /data/backups/hourly/homeapp-YYYYMMDD-HHMMSS.db /data/db/homeapp.db

# Restart
docker compose start app

# Verify
curl http://localhost:3000/api/health
```

### Test a restore (run monthly)

```bash
# Start a temporary container to verify a backup is readable
docker run --rm \
  -v homeapp_backup_data:/backups \
  alpine sh -c "apk add sqlite && sqlite3 /backups/daily/homeapp-$(date +%Y%m%d).db 'SELECT COUNT(*) FROM items;'"
```

---

## Important constraints

- **SQLite only.** Do not migrate to Postgres. Do not add an external DB service.
- **No cluster.** This runs as a single Docker Compose stack on one VM. No Kubernetes, no swarm.
- **pnpm only.** Do not use npm or yarn.
- **Drizzle migrations only.** Never hand-edit the SQLite database schema.
- **Caddy handles HTTPS.** Do not configure SSL/TLS in the app itself.
- **Files on disk.** Uploaded files go to the `file_data` Docker volume. Do not store binaries in SQLite.
- **Two users.** Do not add user registration, public signup, or multi-household features.

---

## Docker volumes reference

| Volume | Contents | Backup priority |
|--------|----------|-----------------|
| `homeapp_db_data` | SQLite database file | Critical — backed up hourly |
| `homeapp_file_data` | Uploaded documents/files | High — backed up daily |
| `homeapp_backup_data` | Local backup store | N/A (is the backup) |
| `homeapp_caddy_data` | TLS certificates | Low — auto-renewed by Caddy |
| `homeapp_caddy_config` | Caddy config cache | Low |

---

## Security checklist (before going live)

- [ ] `SESSION_SECRET` is a unique 64-byte random hex string
- [ ] `.env` is not committed to git (check `.gitignore`)
- [ ] Domain configured in `Caddyfile` and `.env`
- [ ] SMTP credentials are working (test magic link login)
- [ ] Firewall: only ports 80 and 443 open (not 3000, not SSH except from trusted IPs)
- [ ] SSH key auth only (disable password SSH login)
- [ ] Backup running: `docker compose logs backup --tail=20` shows recent runs
- [ ] Health check passing: `curl https://your-domain.com/api/health` returns 200

---

## Monitoring

Install Uptime Kuma alongside this stack for lightweight monitoring:

```bash
docker run -d \
  --name uptime-kuma \
  -p 3001:3001 \
  -v uptime-kuma:/app/data \
  --restart unless-stopped \
  louislam/uptime-kuma:1
```

Then add a monitor for `https://your-domain.com/api/health` and configure push notifications.
