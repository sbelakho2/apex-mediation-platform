#!/usr/bin/env bash
set -euo pipefail

# Export VRA (reconciliation) tables for evidence (0.0.10)
# Requires DATABASE_URL in env with rights to read recon_* tables.
# Usage: DATABASE_URL=postgres://... ./scripts/ops/vra_export.sh 2025-12-08

DATE_TAG="${1:-$(date +%F)}"
EVIDENCE_DIR="evidence-${DATE_TAG}/vra"
mkdir -p "${EVIDENCE_DIR}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[err] DATABASE_URL not set"
  exit 1
fi

tables=(recon_statements_norm recon_expected recon_match recon_deltas)
for t in "${tables[@]}"; do
  echo "[run] Exporting ${t}"
  # Row count (for evidence)
  psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM ${t}" > "${EVIDENCE_DIR}/${t}.rowcount.txt" 2>/dev/null || echo "0" > "${EVIDENCE_DIR}/${t}.rowcount.txt"
  # Sample/export up to 1000 rows
  psql "$DATABASE_URL" -c "COPY (SELECT * FROM ${t} LIMIT 1000) TO STDOUT WITH CSV HEADER" > "${EVIDENCE_DIR}/${t}.csv" || echo "[warn] Failed to export ${t}"
done

# Optional: Proof-of-Revenue artifacts if tables exist
echo "[run] Checking for Proof-of-Revenue tables"
exists_daily=$(psql "$DATABASE_URL" -t -A -c "SELECT to_regclass('public.por_daily_roots') IS NOT NULL") || exists_daily=f
exists_monthly=$(psql "$DATABASE_URL" -t -A -c "SELECT to_regclass('public.por_monthly_digest') IS NOT NULL") || exists_monthly=f

if [ "${exists_daily}" = "t" ]; then
  echo "[run] Exporting por_daily_roots"
  psql "$DATABASE_URL" -c "COPY (SELECT * FROM por_daily_roots ORDER BY day DESC LIMIT 1000) TO STDOUT WITH CSV HEADER" > "${EVIDENCE_DIR}/por_daily_roots.csv" || echo "[warn] Failed to export por_daily_roots"
fi
if [ "${exists_monthly}" = "t" ]; then
  echo "[run] Exporting por_monthly_digest"
  psql "$DATABASE_URL" -c "COPY (SELECT * FROM por_monthly_digest ORDER BY month DESC LIMIT 1000) TO STDOUT WITH CSV HEADER" > "${EVIDENCE_DIR}/por_monthly_digest.csv" || echo "[warn] Failed to export por_monthly_digest"
fi

echo "[done] VRA exports saved under ${EVIDENCE_DIR}"
