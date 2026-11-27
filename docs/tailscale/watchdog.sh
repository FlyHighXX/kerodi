#!/usr/bin/env bash
# Keep the Kerodi always-on services alive. Intended to be launched at boot by
# boot-start.sh, but safe to run manually too.
set -uo pipefail

REPO_DIR="${KERODI_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
RUN_DIR="${HOME}/.kerodi"
START_SCRIPT="$REPO_DIR/docs/tailscale/start-on-termux.sh"
INTERVAL="${KERODI_WATCHDOG_INTERVAL_SECONDS:-60}"

mkdir -p "$RUN_DIR"

if ! command -v termux-wake-lock >/dev/null 2>&1; then
  echo "termux-wake-lock not available; Android may sleep the host."
fi

if [ ! -f "$START_SCRIPT" ]; then
  echo "Start script not found: $START_SCRIPT" >&2
  exit 1
fi

echo "Kerodi watchdog started; checking every ${INTERVAL}s."

while true; do
  bash "$START_SCRIPT" >"$RUN_DIR/watchdog-run.log" 2>&1 || true
  sleep "$INTERVAL"
done
