#!/bin/sh
# ============================================================
# HomeApp — SQLite backup script
# Runs hourly inside the backup container.
# Prunes old backups. Optionally syncs off-site with rclone.
# ============================================================

set -e

DB_SOURCE="/data/db/homeapp.db"
BACKUP_DIR="/data/backups"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
HOURLY_DIR="$BACKUP_DIR/hourly"
DAILY_DIR="$BACKUP_DIR/daily"
FILES_DIR="$BACKUP_DIR/files"
STATUS_DIR="$BACKUP_DIR/status"
LOG_PREFIX="[backup $TIMESTAMP]"

RETENTION_HOURS="${BACKUP_RETENTION_HOURS:-24}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$HOURLY_DIR" "$DAILY_DIR" "$FILES_DIR" "$STATUS_DIR"

# --- Skip if DB doesn't exist yet ---
if [ ! -f "$DB_SOURCE" ]; then
    echo "$LOG_PREFIX DB not found at $DB_SOURCE — skipping"
    exit 0
fi

# --- Hot backup using SQLite backup API (safe during writes) ---
BACKUP_FILE="$HOURLY_DIR/homeapp-$TIMESTAMP.db"
sqlite3 "$DB_SOURCE" ".backup $BACKUP_FILE"
echo "$LOG_PREFIX Created $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

CHECK_RESULT=$(sqlite3 "$BACKUP_FILE" "PRAGMA quick_check;")
if [ "$CHECK_RESULT" != "ok" ]; then
    echo "$LOG_PREFIX Backup integrity check failed: $CHECK_RESULT"
    rm -f "$BACKUP_FILE"
    exit 1
fi
echo "$LOG_PREFIX Backup integrity check passed"

# --- Create a daily snapshot at midnight (hour 00) ---
HOUR=$(date +"%H")
if [ "$HOUR" = "00" ]; then
    DAILY_FILE="$DAILY_DIR/homeapp-$(date +"%Y%m%d").db"
    cp "$BACKUP_FILE" "$DAILY_FILE"
    echo "$LOG_PREFIX Daily snapshot: $DAILY_FILE"
fi

# --- Prune old hourly backups ---
find "$HOURLY_DIR" -name "*.db" -mmin "+$((RETENTION_HOURS * 60))" -delete
find "$HOURLY_DIR" \( -name "*.db-journal" -o -name "*.db-wal" -o -name "*.db-shm" \) -mmin "+60" -delete
HOURLY_COUNT=$(find "$HOURLY_DIR" -name "*.db" | wc -l)
echo "$LOG_PREFIX Hourly backups retained: $HOURLY_COUNT"

# --- Prune old daily backups ---
find "$DAILY_DIR" -name "*.db" -mtime "+$RETENTION_DAYS" -delete
DAILY_COUNT=$(find "$DAILY_DIR" -name "*.db" | wc -l)
echo "$LOG_PREFIX Daily backups retained: $DAILY_COUNT"

# --- Also backup files directory ---
if [ -d "/data/files" ]; then
    mkdir -p "$FILES_DIR/current" "$FILES_DIR/deleted"
    rsync -a --delete --backup --backup-dir="$FILES_DIR/deleted/$TIMESTAMP" --exclude 'dropzone/' /data/files/ "$FILES_DIR/current/"
    find "$FILES_DIR/deleted" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -exec rm -rf {} +
    echo "$LOG_PREFIX Files directory synced to backup"
fi

# --- Optional: off-site sync via rclone ---
if [ -n "$RCLONE_REMOTE" ] && [ -n "$RCLONE_BUCKET" ] && command -v rclone >/dev/null 2>&1; then
    rclone sync "$BACKUP_DIR/" "$RCLONE_REMOTE:$RCLONE_BUCKET/" \
        --exclude "*.tmp" \
        --log-level INFO
    echo "$LOG_PREFIX Off-site sync to $RCLONE_REMOTE:$RCLONE_BUCKET complete"
fi

date +%s > "$STATUS_DIR/last-success"
printf '%s\n' "$TIMESTAMP" > "$STATUS_DIR/last-success-label"
echo "$LOG_PREFIX Backup complete"
