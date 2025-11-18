#!/usr/bin/env bash

# Automated Accounting System - Dependency Installation
# Safe installer for accounting-related npm packages.

set -euo pipefail

DRY_RUN=${DRY_RUN:-0}
YES=${YES:-0}
UPGRADE_PKG=""

usage(){ cat <<USAGE
Install accounting dependencies reproducibly.

Usage:
  $(basename "$0") [--dry-run] [--yes] [--upgrade pkg@ver]

Notes:
  - Default behavior is non-mutating of package.json/lockfile: uses npm ci when needed.
  - To upgrade a specific package, pass --upgrade and confirm (or use --yes).
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --yes|-y) YES=1; shift ;;
    --upgrade) UPGRADE_PKG="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

echo "=================================================="
echo "Installing Accounting System Dependencies"
echo "=================================================="
echo ""

cd "$(dirname "$0")/../backend"

run(){ echo "+ $*"; [[ "$DRY_RUN" -eq 1 ]] && return 0; "$@"; }

if [[ -n "$UPGRADE_PKG" ]]; then
  echo "Requested upgrade: $UPGRADE_PKG"
  if [[ "$YES" -ne 1 && "$DRY_RUN" -ne 1 ]]; then
    read -p "This will modify package.json/lockfile. Proceed? (y/n) " -n 1 -r; echo
    [[ $REPLY =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
  fi
  run npm install "$UPGRADE_PKG"
else
  echo "Performing reproducible install via npm ci (non-mutating)"
  run npm ci
fi

# Ensure required core deps are installed (idempotent, prefer adding if missing only)
ensure_pkg(){ pkg="$1"; dev="$2"; if [[ "$DRY_RUN" -eq 1 ]]; then echo "[DRY-RUN] ensure $pkg (dev=$dev)"; return; fi
  if ! npm ls "$pkg" >/dev/null 2>&1; then
    if [[ "$dev" == "dev" ]]; then npm install -D "$pkg"; else npm install "$pkg"; fi
  fi
}

echo "Verifying accounting dependencies..."
ensure_pkg stripe ""
ensure_pkg pdfkit ""
ensure_pkg @types/pdfkit dev
ensure_pkg @aws-sdk/client-s3 ""
ensure_pkg fast-xml-parser ""
ensure_pkg date-fns ""

echo ""
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "(dry-run) Skipped execution; printed planned steps above."
else
  echo "✅ Dependencies ensured."
fi
echo ""
echo "Next steps:"
echo "1. Configure environment variables in .env (STRIPE_*, S3_ACCOUNTING_BUCKET, etc.)"
echo "2. Run database migration as needed (see backend/migrations)"
echo "3. Set up S3 bucket with Object Lock: ./scripts/setup-s3-accounting.sh --dry-run to preview"
echo "4. Run integration tests: npm test backend/services/accounting/"
echo ""
