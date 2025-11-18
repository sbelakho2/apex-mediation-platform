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

validate_upgrade_target(){
  local target="$1"
  local after_slash="${target##*/}"
  if [[ "$after_slash" != *@* ]]; then
    echo "Please provide an explicit version (pkg@1.2.3 or @scope/pkg@1.2.3) for --upgrade." >&2
    exit 2
  fi
  local version="${after_slash##*@}"
  if [[ "$version" == "latest" ]]; then
    echo "Explicit version required: refuse to install '@latest'." >&2
    exit 2
  fi
}

if [[ -n "$UPGRADE_PKG" ]]; then
  validate_upgrade_target "$UPGRADE_PKG"
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

missing_pkgs=0

lookup_manifest_version(){
  local pkg="$1"
  local section="$2"
  node -p "(() => { const pkgJson = require('./package.json'); const key = '$section' === 'dev' ? 'devDependencies' : 'dependencies'; const val = pkgJson[key] && pkgJson[key]['$pkg']; return val || ''; })()" 2>/dev/null
}

ensure_pkg(){
  local pkg="$1"
  local section="$2" # 'prod' or 'dev'
  local label
  local install_hint
  if [[ "$section" == "dev" ]]; then
    label="devDependencies"
    install_hint="npm install -D $pkg@<version>"
  else
    label="dependencies"
    install_hint="npm install $pkg@<version>"
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[DRY-RUN] would verify $pkg is declared under $label"
    return
  fi
  local declared
  declared=$(lookup_manifest_version "$pkg" "$section")
  if [[ -z "$declared" ]]; then
    echo "❌ $pkg is not declared in $label. Add via: $install_hint"
    missing_pkgs=1
    return
  fi
  if ! npm ls "$pkg" >/dev/null 2>&1; then
    echo "⚠️  $pkg@$declared declared in $label but not installed. Re-run npm ci."
    missing_pkgs=1
    return
  fi
  echo "✅ $pkg@$declared present in $label"
}

echo "Verifying accounting dependencies..."
ensure_pkg stripe prod
ensure_pkg pdfkit prod
ensure_pkg @types/pdfkit dev
ensure_pkg @aws-sdk/client-s3 prod
ensure_pkg fast-xml-parser prod
ensure_pkg date-fns prod

echo ""
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "(dry-run) Skipped execution; printed planned steps above."
else
  if [[ "$missing_pkgs" -ne 0 ]]; then
    echo "❌ One or more required accounting dependencies are missing. See messages above."
    exit 1
  fi
  echo "✅ Dependencies ensured."
fi
echo ""
echo "Next steps:"
echo "1. Configure environment variables in .env (STRIPE_*, S3_ACCOUNTING_BUCKET, etc.)"
echo "2. Run database migration as needed (see backend/migrations)"
echo "3. Set up S3 bucket with Object Lock: ./scripts/setup-s3-accounting.sh --dry-run to preview"
echo "4. Run integration tests: npm test backend/services/accounting/"
echo ""
