#!/usr/bin/env bash
# Start the Kerodi always-on services on the Android/Termux build host:
# Tailscale, Jenkins, the Freerider push worker, the webhook-only proxy, and
# Tailscale Funnel. Run from anywhere; paths are resolved relative to this
# repository. Safe to re-run.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="${HOME}/.kerodi"
TOKEN_FILE="${RUN_DIR}/jenkins-webhook-token"
JENKINS_WAR="/opt/jenkins/jenkins.war"
JVM_OPTIONS="/etc/jenkins/jvm.options"

NODE_BIN="${NODE_BIN:-}"
[ -n "$NODE_BIN" ] || NODE_BIN="$(command -v node 2>/dev/null || true)"
[ -n "$NODE_BIN" ] || [ ! -x /data/data/com.termux/files/usr/bin/node ] ||
  NODE_BIN=/data/data/com.termux/files/usr/bin/node
if [ -z "$NODE_BIN" ]; then
  echo "!! node not found; set NODE_BIN and retry"
  exit 1
fi

mkdir -p "$RUN_DIR" /var/run/tailscale /var/lib/tailscale

http_ok() {
  curl -fsS -o /dev/null --max-time 5 "$1" 2>/dev/null
}

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

if [ -f "$JENKINS_WAR" ] && ! http_ok http://127.0.0.1:8080/login; then
  echo "==> Starting Jenkins"
  JAVA_ARGS=()
  [ -f "$JVM_OPTIONS" ] && JAVA_ARGS+=("@$JVM_OPTIONS")
  nohup java "${JAVA_ARGS[@]}" \
    -Djenkins.model.Jenkins.slaveAgentPort=-1 \
    -DJENKINS_HOME=/var/lib/jenkins \
    -jar "$JENKINS_WAR" \
    --httpPort=8080 \
    --httpListenAddress=0.0.0.0 \
    >"$RUN_DIR/jenkins.log" 2>&1 &
  for _ in $(seq 1 60); do
    http_ok http://127.0.0.1:8080/login && break
    sleep 2
  done
fi

if ! pgrep -f 'freerider-push-worker.mjs' >/dev/null 2>&1; then
  echo "==> Starting Freerider push worker"
  cd "$REPO_DIR"
  SESSIONS_FILE="$RUN_DIR/freerider-sessions.json" \
  HISTORY_FILE="$RUN_DIR/freerider-history.json" \
  POLL_SECONDS=60 \
  CONTROL_HOST=0.0.0.0 \
  CONTROL_PORT=8787 \
    nohup "$NODE_BIN" scripts/freerider-push-worker.mjs >"$RUN_DIR/worker.log" 2>&1 &
  for _ in $(seq 1 30); do
    http_ok http://127.0.0.1:8787/health && break
    sleep 1
  done
fi

if [ -f "$TOKEN_FILE" ] && ! pgrep -f 'jenkins-webhook-proxy.mjs' >/dev/null 2>&1; then
  echo "==> Starting webhook-only proxy"
  cd "$REPO_DIR"
  KERODI_WEBHOOK_TOKEN_FILE="$TOKEN_FILE" \
  KERODI_WEBHOOK_PROXY_PORT=8788 \
    setsid nohup "$NODE_BIN" scripts/jenkins-webhook-proxy.mjs \
      >"$RUN_DIR/jenkins-webhook-proxy.log" 2>&1 < /dev/null &
elif [ ! -f "$TOKEN_FILE" ]; then
  echo "!! Missing $TOKEN_FILE; webhook proxy was not started."
fi

echo "==> Tailscale"
tailscale status 2>&1 | head -10

if ! tailscale funnel status 2>/dev/null | grep -q 'Funnel on'; then
  echo "==> Starting Tailscale Funnel on 8788"
  tailscale funnel --bg --yes 8788 || echo "!! Funnel failed; check 'tailscale funnel status'."
fi

echo "==> Funnel"
tailscale funnel status 2>&1 | head -10
echo "==> Jenkins"
http_ok http://127.0.0.1:8080/login && echo "Jenkins OK" || echo "Jenkins NOT ready"
echo "==> Worker health"
curl -fsS http://127.0.0.1:8787/health && echo
echo "==> Webhook proxy"
pgrep -af 'jenkins-webhook-proxy.mjs' || echo "proxy NOT running"
