#!/usr/bin/env bash
set -euo pipefail

# Networked sandbox helper: prepares evidence folders and runs automatable local suites
# Usage: scripts/ops/run_networked_sandbox.sh [YYYY-MM-DD]

DATE_TAG="${1:-$(date +%F)}"
EVIDENCE_DIR="evidence-${DATE_TAG}"

echo "[run] Preparing evidence folder: ${EVIDENCE_DIR}"
mkdir -p "${EVIDENCE_DIR}/"{console,website,billing,vra,cron,soak,sdk-logs}

log_step() { echo "[run] $*"; }
run_or_skip() {
  local cmd="$1"; shift || true
  if eval "${cmd}" >/dev/null 2>&1; then
    "$@"
  else
    echo "[skip] ${*} (dependency not found)"
  fi
}

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
pushd "${ROOT_DIR}" >/dev/null

# 1) Website security/unit tests
if [ -d "website" ]; then
  log_step "Running website test suite"
  set +e
  npm --prefix website run test | tee "${EVIDENCE_DIR}/website/security-tests.txt"
  set -e
else
  echo "[skip] website folder not found"
fi

# 2) Backend tests
if [ -d "backend" ]; then
  log_step "Running backend Jest suite"
  set +e
  npm --prefix backend run test | tee "${EVIDENCE_DIR}/sdk-logs/backend-tests.txt"
  set -e
else
  echo "[skip] backend folder not found"
fi

# 3) iOS/tvOS core tests (Swift)
if [ -d "sdk/core/ios" ]; then
  log_step "Running iOS/tvOS swift tests"
  pushd sdk/core/ios >/dev/null
  set +e
  swift test | tee "${ROOT_DIR}/${EVIDENCE_DIR}/sdk-logs/ios-swift-tests.txt"
  set -e
  popd >/dev/null
else
  echo "[skip] iOS core not found"
fi

# 4) Android core tests (unit)
if [ -d "sdk/core/android" ]; then
  log_step "Running Android unit tests"
  pushd sdk/core/android >/dev/null
  set +e
  GRADLEW=""
  if [ -x "./gradlew" ]; then
    GRADLEW="./gradlew"
  elif [ -x "../../gradlew" ]; then
    GRADLEW="../../gradlew"
  elif command -v gradle >/dev/null 2>&1; then
    GRADLEW="gradle"
  fi
  if [ -n "$GRADLEW" ]; then
    "$GRADLEW" test | tee "${ROOT_DIR}/${EVIDENCE_DIR}/sdk-logs/android-unit-tests.txt"
  else
    echo "[skip] Gradle wrapper/gradle not found; skipping Android unit tests" | tee -a "${ROOT_DIR}/${EVIDENCE_DIR}/sdk-logs/android-unit-tests.txt"
  fi
  set -e
  popd >/dev/null
else
  echo "[skip] Android core not found"
fi

echo "[done] Local automatable steps complete."
echo "Next: follow docs/Internal/QA/networked-sandbox-runbook-${DATE_TAG}.md for staging Console, Stripe, VRA, Cron, and Soak flows."

popd >/dev/null
