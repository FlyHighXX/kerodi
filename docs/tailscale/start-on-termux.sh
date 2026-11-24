#!/usr/bin/env bash
# Start Tailscale (userspace networking) and the Freerider push worker on the
# Android/Termux build host. Run from anywhere; paths are resolved relative to
# this repository. Safe to re-run.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="${HOME}/.kerodi"
mkdir -p "$RUN_DIR" /var/run/tailscale /var/lib/tailscale

if ! pgrep -f 'tailscaled .*userspace-networking' >/dev/null 2>&1; then
  echo "==> Starting tailscaled (userspace-networking)"
  nohup /usr/sbin/tailscaled \
    --tun=userspace-networking \
    --state=/var/lib/tailscale/tailscaled.state \
    --socket=/var/run/tailscale/tailscaled.sock \
    --port=41641 \
    >"$RUN_DIR/tailscaled.log" 2>&1 &
  sleep 3
fi

if ! tailscale status >/dev/null 2>&1; then
  echo "!! Tailscale is logged out. Run 'tailscale up' and approve the printed URL."
fi

if ! pgrep -f 'freerider-push-worker.mjs' >/dev/null 2>&1; then
  echo "==> Starting Freerider push worker"
  cd "$REPO_DIR"
  SESSIONS_FILE="$RUN_DIR/freerider-sessions.json" \
  HISTORY_FILE="$RUN_DIR/freerider-history.json" \
  POLL_SECONDS=10 \
  CONTROL_HOST=0.0.0.0 \
  CONTROL_PORT=8787 \
    nohup node scripts/freerider-push-worker.mjs >"$RUN_DIR/worker.log" 2>&1 &
fi

echo "==> Tailscale"
tailscale status 2>&1 | head -10
echo "==> Worker health"
curl -fsS http://127.0.0.1:8787/health && echo
