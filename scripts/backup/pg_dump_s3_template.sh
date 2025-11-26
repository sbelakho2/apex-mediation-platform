#!/usr/bin/env bash
set -euo pipefail

# Postgres → S3-compatible backup template
# Supported targets: MinIO (self-hosted, primary), DigitalOcean Spaces (offsite), AWS S3
#
# Required env vars:
#   PGHOST, PGPORT, PGDATABASE, PGUSER, (PGPASSWORD or PGPASSFILE)
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   S3_BUCKET              # e.g. s3://apex-prod-backups
# Optional env vars:
#   S3_PREFIX              # e.g. pg/
#   AWS_DEFAULT_REGION     # e.g. eu-central-1
#   S3_ENDPOINT            # e.g. http://minio:9000 (primary) or https://fra1.digitaloceanspaces.com (offsite)
#   BACKUP_RETENTION_DAYS  # default 30 (only informational; lifecycle via bucket policy)
#   BACKUP_LABEL           # e.g. prod
#   DRY_RUN=1              # print commands without executing
#
# Notes:
# - For MinIO primary, set S3_ENDPOINT to the internal MinIO endpoint and provide access keys.
# - For DO Spaces offsite, set S3_ENDPOINT and AWS_DEFAULT_REGION appropriately.
# - Configure bucket lifecycle rules for retention enforcement server-side.

timestamp() { date -u +"%Y%m%dT%H%M%SZ"; }

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[ERROR] Missing required env var: $name" >&2
    exit 2
  fi
}

main() {
  require PGHOST; require PGPORT; require PGDATABASE; require PGUSER
  if [[ -z "${PGPASSWORD:-}" && -z "${PGPASSFILE:-}" ]]; then
    echo "[ERROR] Provide PGPASSWORD or PGPASSFILE" >&2
    exit 2
  fi
  require AWS_ACCESS_KEY_ID; require AWS_SECRET_ACCESS_KEY; require S3_BUCKET

  local ts="$(timestamp)"
  local label="${BACKUP_LABEL:-prod}"
  local prefix="${S3_PREFIX:-pg/}"
  local fname="${PGDATABASE}_${label}_${ts}.sql.gz"
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  local dump_path="$tmpdir/$fname"

  echo "[INFO] Dumping Postgres database '$PGDATABASE' from $PGHOST:$PGPORT (sslmode=require)"
  local pgdump_cmd=(pg_dump "postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=require" -F p)
  if [[ -n "${PGPASSWORD:-}" ]]; then
    export PGPASSWORD
  fi
  if [[ -n "${PGPASSFILE:-}" ]]; then
    export PGPASSFILE
  fi

  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "[DRY_RUN] ${pgdump_cmd[*]} | gzip > $dump_path"
  else
    "${pgdump_cmd[@]}" | gzip > "$dump_path"
  fi

  echo "[INFO] Uploading to object storage: $S3_BUCKET/${prefix}${fname}"
  local aws_cp=(aws s3 cp "$dump_path" "$S3_BUCKET/${prefix}${fname}")
  if [[ -n "${S3_ENDPOINT:-}" ]]; then
    aws_cp+=(--endpoint-url "$S3_ENDPOINT")
  fi
  if [[ -n "${AWS_DEFAULT_REGION:-}" ]]; then
    export AWS_DEFAULT_REGION
  fi

  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "[DRY_RUN] ${aws_cp[*]}"
  else
    "${aws_cp[@]}"
  fi

  echo "[INFO] Verifying uploaded object exists"
  local aws_ls=(aws s3 ls "$S3_BUCKET/${prefix}${fname}")
  if [[ -n "${S3_ENDPOINT:-}" ]]; then
    aws_ls+=(--endpoint-url "$S3_ENDPOINT")
  fi
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "[DRY_RUN] ${aws_ls[*]}"
  else
    "${aws_ls[@]}" >/dev/null
    echo "[INFO] Backup complete: ${S3_BUCKET}/${prefix}${fname}"
  fi

  echo "[NOTE] Enforce retention with bucket lifecycle rules (BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30})."
}

main "$@"
