#!/usr/bin/env bash
#
# Nightly pg_dump of the stack's database.
#
# Postgres runs in a container with a named volume, which survives `docker compose down`
# and `docker compose up --build` — but not `docker compose down -v`, and not the day the
# instance is reclaimed. This is the thing that makes that recoverable.
#
# Install (from the repo directory on the server):
#
#   chmod +x deploy/backup.sh
#   sudo crontab -e
#   15 3 * * * /home/ubuntu/Ui-builder/deploy/backup.sh >> /var/log/ui-builder-backup.log 2>&1
#
# Restore:
#
#   gunzip -c backups/ui_builder-2026-09-14.sql.gz \
#     | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

cd "$REPO_DIR"

# The same .env compose reads, so this script never carries its own copy of the password.
set -a
# shellcheck disable=SC1091
source .env
set +a

mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/${POSTGRES_DB}-$(date +%F).sql.gz"

# -T because cron has no TTY. Writing through a temp file means an interrupted dump never
# replaces a good backup with a truncated one.
docker compose exec -T postgres \
	pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists |
	gzip >"$target.partial"

mv "$target.partial" "$target"

# Keep a fortnight. Enough to notice a problem that only shows up on a Monday.
find "$BACKUP_DIR" -name "${POSTGRES_DB}-*.sql.gz" -mtime "+$KEEP_DAYS" -delete

echo "$(date --iso-8601=seconds)  wrote $target ($(du -h "$target" | cut -f1))"
