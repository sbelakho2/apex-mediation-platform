#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRADLE_VERSION="${GRADLE_VERSION:-8.7}"
DIST_DIR="${SCRIPT_DIR}/.gradle-dist"
GRADLE_HOME="${GRADLE_USER_HOME:-${SCRIPT_DIR}/.gradle-home}"

mkdir -p "${DIST_DIR}" "${GRADLE_HOME}"

GRADLE_DIR="${DIST_DIR}/gradle-${GRADLE_VERSION}"
GRADLE_BIN="${GRADLE_DIR}/bin/gradle"

if [[ ! -x "${GRADLE_BIN}" ]]; then
  ARCHIVE="${DIST_DIR}/gradle-${GRADLE_VERSION}-bin.zip"
  echo "[gradlew] downloading Gradle ${GRADLE_VERSION} distribution..."
  curl -sSfL "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" -o "${ARCHIVE}"
  unzip -q "${ARCHIVE}" -d "${DIST_DIR}"
  rm -f "${ARCHIVE}"
  chmod +x "${GRADLE_BIN}"
fi

export GRADLE_USER_HOME="${GRADLE_HOME}"
exec "${GRADLE_BIN}" --project-dir "${SCRIPT_DIR}" "$@"
