#!/data/data/com.termux/files/usr/bin/bash
# Termux:Boot entrypoint. Copy this file to ~/.termux/boot/kerodi.sh and make it
# executable. Adjust KERODI_REPO_DIR below if the repo lives elsewhere.
set -u

RUN_DIR="${HOME}/.kerodi"
KERODI_REPO_DIR="${KERODI_REPO_DIR:-/root/repos/kerodi}"
WATCHDOG="$KERODI_REPO_DIR/docs/tailscale/watchdog.sh"

mkdir -p "$RUN_DIR"

if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
fi

# Give Android time to finish mounting storage and bringing up networking.
sleep 30

if [ -f "$WATCHDOG" ]; then
  nohup env KERODI_REPO_DIR="$KERODI_REPO_DIR" \
    bash "$WATCHDOG" >"$RUN_DIR/watchdog.log" 2>&1 &
  echo "Kerodi watchdog launched." >>"$RUN_DIR/watchdog.log"
else
  echo "Watchdog not found at $WATCHDOG; set KERODI_REPO_DIR correctly." \
    >"$RUN_DIR/boot-start.log"
fi
