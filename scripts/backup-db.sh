#!/bin/bash
# Nightly Postgres dump. Local-only for now (per current setup) — this
# protects against "oops, deleted the wrong rows" and against the container
# volume getting corrupted, but NOT against the VPS disk failing or the whole
# box being compromised. Worth adding an offsite copy (S3/Backblaze/another
# host) later; this script is written so adding a final "upload $OUT_FILE
# somewhere" step is a one-line addition when you're ready for that.

set -euo pipefail

cd /home/pi/workshop
set -a
source .env
set +a

BACKUP_DIR="./backups"
RETENTION_DAYS=14
TIMESTAMP="$(date +%F_%H%M%S)"
OUT_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

docker compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT_FILE"

# Fail loudly if the dump is empty or corrupt rather than silently keeping a
# useless backup around.
gzip -t "$OUT_FILE"
if [ ! -s "$OUT_FILE" ]; then
  echo "Backup file is empty: $OUT_FILE" >&2
  exit 1
fi

echo "Backup written to $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# Prune backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name '*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -print -delete
