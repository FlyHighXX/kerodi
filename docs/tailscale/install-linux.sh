#!/usr/bin/env bash
# Install and join Tailscale on a Linux host (Jenkins controller, worker, admin box).
#
# Usage (never commit the auth key):
#   TS_AUTHKEY=tskey-auth-... \
#   TS_HOSTNAME=kerodi-jenkins \
#   TS_TAGS=tag:jenkins-controller \
#   bash docs/tailscale/install-linux.sh
#
# Optional: TS_USER=someuser to attach tags to a specific identity.
set -euo pipefail

: "${TS_AUTHKEY:?Set TS_AUTHKEY to a (preferably single-use) Tailscale auth key}"
: "${TS_HOSTNAME:?Set TS_HOSTNAME, e.g. kerodi-jenkins}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "==> Installing Tailscale"
  curl -fsSL https://tailscale.com/install.sh | sh
else
  echo "==> Tailscale already installed: $(tailscale version | head -1)"
fi

args=(--authkey="$TS_AUTHKEY" --hostname="$TS_HOSTNAME")
if [[ -n "${TS_TAGS:-}" ]]; then
  args+=(--advertise-tags="$TS_TAGS")
fi
if [[ -n "${TS_USER:-}" ]]; then
  args+=(--user="$TS_USER")
fi

echo "==> Joining tailnet as $TS_HOSTNAME"
tailscale up "${args[@]}"

echo "==> Status"
tailscale status
echo "==> This node: $(tailscale ip -4)"
