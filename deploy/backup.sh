#!/usr/bin/env bash
#
# Nightly pg_dump of the stack's database, kept locally and — if configured — copied off
# the instance.
#
# Postgres runs in a container with a named volume, which survives `docker compose down`
# and `docker compose up --build` — but not `docker compose down -v`, and not the day the
# instance is reclaimed. A dump sitting on that same instance's disk does not survive the
# last two either, which is the whole reason for the upload step below: a backup that
# shares a failure domain with the thing it is backing up is a copy, not a backup.
#
# Install (from the repo directory on the server):
#
#   chmod +x deploy/backup.sh
#   sudo crontab -e
#   15 3 * * * /home/ubuntu/Ui-builder/deploy/backup.sh >> /var/log/ui-builder-backup.log 2>&1
#
# Off-instance copies are opt-in. Set BACKUP_S3_DEST in .env to a bucket URI and the dump
# is uploaded there after it is written:
#
#   BACKUP_S3_DEST=s3://my-backup-bucket/ui-builder
#
# Credentials come from the S3_* block .env already carries for asset uploads, so pointing
# this at the same provider needs one new variable. Use a *separate* bucket that the
# application's own key cannot delete from if you can — the asset key is in a running
# web process, and a backup an attacker can erase is one you do not have.
#
# The upload runs through a throwaway `amazon/aws-cli` container rather than a host
# install: this script already requires docker for `docker compose exec`, so that is one
# dependency instead of two, and nothing has to be kept up to date on the instance.
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

# ── Off the instance ────────────────────────────────────────────────────────────────
#
# Loud when it is not configured, because the failure mode of a backup script is silence:
# nobody reads a log that has said "ok" every night for six months, and the day it matters
# is the day the disk is gone. A warning every run is the only thing that gets noticed
# before then.
if [[ -z "${BACKUP_S3_DEST:-}" ]]; then
	echo "  warning: BACKUP_S3_DEST is not set, so this backup exists only on this instance." >&2
	echo "  warning: it will not survive the VM being lost or reclaimed. See deploy/backup.sh." >&2
	exit 0
fi

if [[ -z "${S3_ACCESS_KEY_ID:-}" || -z "${S3_SECRET_ACCESS_KEY:-}" ]]; then
	echo "  error: BACKUP_S3_DEST is set but S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are not." >&2
	exit 1
fi

# Only for providers that are not AWS itself — the same variable, and the same reason, as
# in the S3_* block .env documents.
endpoint_args=()
if [[ -n "${S3_ENDPOINT:-}" ]]; then
	endpoint_args=(--endpoint-url "$S3_ENDPOINT")
fi

# Read-only mount and a single named file: this container needs to send one object, so it
# is given exactly that and no write access to the backup directory it came from.
docker run --rm \
	-e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
	-e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
	-e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
	-v "$target:/dump.sql.gz:ro" \
	amazon/aws-cli:latest \
	s3 cp /dump.sql.gz "${BACKUP_S3_DEST%/}/$(basename "$target")" \
	"${endpoint_args[@]}"

echo "$(date --iso-8601=seconds)  uploaded to ${BACKUP_S3_DEST%/}/$(basename "$target")"
