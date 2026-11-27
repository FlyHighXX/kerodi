# Host setup instructions for OpenCode

Paste this file into OpenCode running on the always-on Kerodi host and tell it to execute the steps in order. Stop and report errors instead of forcing through failures.

These steps restore the host and set up unattended recovery so Jenkins, the Freerider worker, and Tailscale Funnel come back automatically.

## Context

The host is the Android/Termux machine named:

```text
kerodi-android-build
Tailscale IP: 100.77.0.70
Tailnet:      tail8d2385.ts.net
```

Expected deployed repo path inside the root/proot environment:

```text
/root/repos/kerodi
```

Expected branch:

```text
feat/freerider-history-dates
```

Expected runtime state directory:

```text
/root/.kerodi
```

Do not expose Jenkins UI/API publicly. Tailscale Funnel must continue to target only `127.0.0.1:8788`, the webhook-only proxy.

---

## 1. Update the repo on the host

Run inside the same root/proot environment where Jenkins and the worker run:

```bash
cd /root/repos/kerodi
git fetch origin
git checkout feat/freerider-history-dates
git pull --ff-only origin feat/freerider-history-dates
```

If the pull refuses because of local changes, stop and report the `git status` output. Do not overwrite unknown local work.

Confirm these files exist:

```bash
ls -l docs/tailscale/start-on-termux.sh \
      docs/tailscale/watchdog.sh \
      docs/tailscale/boot-start.sh \
      docs/operations/HOST-SETUP-FOR-OPENCODE.md
```

---

## 2. Start all Kerodi services now

```bash
cd /root/repos/kerodi
bash docs/tailscale/start-on-termux.sh
```

This should start or verify:

- `tailscaled` in userspace-networking mode
- Jenkins on `127.0.0.1:8080`
- Freerider worker on `0.0.0.0:8787`
- webhook-only proxy on `127.0.0.1:8788`
- Tailscale Funnel on HTTPS port 443 pointing to `8788`

If Tailscale says it is logged out:

```bash
tailscale up --hostname=kerodi-android-build
```

Approve the printed URL in the Tailscale admin console if prompted.

---

## 3. Verify services

All of these should succeed:

```bash
tailscale status

tailscale funnel status

curl -fsS http://127.0.0.1:8787/health

curl -fsS http://127.0.0.1:8080/login >/dev/null && echo "Jenkins OK"

pgrep -af 'jenkins.war'
pgrep -af 'freerider-push-worker.mjs'
pgrep -af 'jenkins-webhook-proxy.mjs'
```

Expected Funnel target:

```text
https://kerodi-android-build.tail8d2385.ts.net
|-- / proxy http://127.0.0.1:8788
```

If the Funnel target is `8080`, fix it immediately:

```bash
tailscale funnel --https=443 off
tailscale funnel --bg --yes 8788
tailscale funnel status
```

Do not leave Funnel pointed at Jenkins.

---

## 4. Enable Tailscale SSH

On the host:

```bash
tailscale set --ssh
```

This only needs to be done once. Tailscale SSH is private to the tailnet; it does not expose SSH through Funnel.

The Tailscale admin console still needs an SSH policy. The owner should add/merge this in **Access controls**:

```json
"ssh": [
  {
    "action": "check",
    "checkPeriod": "1h",
    "src": ["autogroup:member"],
    "dst": ["autogroup:self"],
    "users": ["root", "autogroup:nonroot"]
  }
]
```

If a working SSH policy already exists, keep it. Do not replace unrelated ACL rules.

---

## 5. Install Termux:Boot autostart

Install and open the **Termux:Boot** app once from F-Droid/Google Play.

The boot script must live in the Termux app's home, not necessarily the proot `/root`. From a Termux shell, or by setting the path explicitly from proot:

```bash
TERMUX_HOME="${TERMUX_HOME:-/data/data/com.termux/files/home}"
mkdir -p "$TERMUX_HOME/.termux/boot"
cp /root/repos/kerodi/docs/tailscale/boot-start.sh \
  "$TERMUX_HOME/.termux/boot/kerodi.sh"
chmod +x "$TERMUX_HOME/.termux/boot/kerodi.sh"
```

Check it:

```bash
ls -l "$TERMUX_HOME/.termux/boot/kerodi.sh"
head -20 "$TERMUX_HOME/.termux/boot/kerodi.sh"
```

The script defaults to:

```bash
KERODI_REPO_DIR=/root/repos/kerodi
```

If the repo is not visible directly from the Termux side, edit `$TERMUX_HOME/.termux/boot/kerodi.sh` so it starts the watchdog through the correct proot login. Example:

```bash
nohup proot-distro login ubuntu -- bash -lc \
  'KERODI_REPO_DIR=/root/repos/kerodi bash /root/repos/kerodi/docs/tailscale/watchdog.sh' \
  > /root/.kerodi/watchdog.log 2>&1 &
```

Replace `ubuntu` with the actual distro name if different.

---

## 6. Start the watchdog immediately

Do not wait for the next reboot:

```bash
nohup bash /root/repos/kerodi/docs/tailscale/watchdog.sh \
  > /root/.kerodi/watchdog.log 2>&1 &
```

Verify:

```bash
pgrep -af 'docs/tailscale/watchdog.sh'
tail -n 30 /root/.kerodi/watchdog.log
```

The watchdog calls `start-on-termux.sh` every 60 seconds. It is safe to run repeatedly because the start script only launches missing services and restores Funnel if it is off.

---

## 7. Final verification

Run this full check:

```bash
tailscale status
tailscale funnel status
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8080/login >/dev/null && echo "Jenkins OK"
pgrep -af 'docs/tailscale/watchdog.sh'
pgrep -af 'jenkins.war'
pgrep -af 'freerider-push-worker.mjs'
pgrep -af 'jenkins-webhook-proxy.mjs'
tail -n 30 /root/.kerodi/watchdog.log
tail -n 30 /root/.kerodi/jenkins.log
tail -n 30 /root/.kerodi/worker.log
tail -n 30 /root/.kerodi/jenkins-webhook-proxy.log
```

Report the outputs.

---

## 8. Remote recovery from another Tailnet device

After setup, recovery from a phone/laptop should only require:

```bash
ssh root@kerodi-android-build
bash /root/repos/kerodi/docs/tailscale/start-on-termux.sh
tail -n 50 /root/.kerodi/watchdog.log
```

If Tailscale itself is down, Tailscale SSH will not work. The boot script/watchdog are what make Tailscale come back automatically.

If the machine is powered off, software cannot wake it. Use Wake-on-LAN if supported, or a smart plug that boots the machine when power returns.

---

## 9. PR build note

The required GitHub status check is:

```text
jenkins/android-apk
```

If a PR is stuck `pending` after the host recovers, redeliver the latest webhook from GitHub or push a new commit to trigger a fresh build. Merge remains blocked until the status is `success`.

Do not bypass the check by restarting Jenkins with `safeRestart`; it has previously failed to relaunch cleanly in this environment.
