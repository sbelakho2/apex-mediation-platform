#!/usr/bin/env bash
set -euo pipefail

# Convenience SSH wrapper for the testing DO droplet.
# Usage:
#   ./scripts/ops/do_ssh.sh                     # open interactive shell
#   ./scripts/ops/do_ssh.sh -- "<remote cmd>"   # run a single remote command

HOST="deploy@164.90.232.151"
KEY="${APEX_DO_SSH_KEY:-$HOME/.ssh/apexmediation-github-deploy}"

if [[ ! -f "$KEY" ]]; then
  echo "[err] SSH key not found at $KEY" >&2
  exit 1
fi

if [[ $# -gt 0 ]]; then
  # If first arg is --, shift and treat remainder as remote command
  if [[ "$1" == "--" ]]; then shift; fi
  echo "[run] ssh -i $KEY $HOST -- $*"
  ssh -i "$KEY" "$HOST" -- "$@"
else
  echo "[run] ssh -i $KEY $HOST"
  ssh -i "$KEY" "$HOST"
fi
