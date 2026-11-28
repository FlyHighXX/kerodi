# Kerodi always-on host runbook

This is the recovery README for the machine that keeps Kerodi running. Use it after a reboot, power loss, Tailscale/Jenkins restart, or any other downtime on the always-on host.

## What must be running

| Service | Host/port | Purpose | Public? |
| --- | --- | --- | --- |
| Tailscale daemon | `tailscaled`, userspace networking | Private tailnet connectivity | No |
| Jenkins controller | `127.0.0.1:8080` | Android APK builds, PR webhook trigger | No — only via webhook proxy |
| Freerider push worker | `0.0.0.0:8787` | Session/history/cached-feed API for the app | Tailnet only |
| Webhook-only proxy | `127.0.0.1:8788` | Allows only the Jenkins webhook path with the correct token | No — behind Funnel |
| Tailscale Funnel | `https://kerodi-android-build.tail8d2385.ts.net/` | Public HTTPS entry to the webhook proxy | Yes, webhook path only |

Current host identity:

```text
Node:      kerodi-android-build
Tailnet:   tail8d2385.ts.net
Tailscale: 100.77.0.70
Funnel:    https://kerodi-android-build.tail8d2385.ts.net/
```

The app default worker URL is `http://100.77.0.70:8787` on fresh installs. Tailscale must be connected on the device running the app; no worker token is entered there.

The worker uses a shared 60-second throttle for every hertzfreerider fetch: scheduled polls, Start baselines, and pull-to-refresh. Tab opens and filter changes read the cached feed through `/routes` without fetching hertzfreerider; only `/poll-now` triggers a throttled refresh. Feed errors back off exponentially, and `/routes` plus `/poll-now` report `nextAllowedAt` so the app can show the remaining cooldown.

Only this Funnel path is intentionally public:

```text
POST /generic-webhook-trigger/invoke?token=<secret>
```

The Jenkins UI, Jenkins API, SSH, worker API, and router/LAN devices are not exposed through Funnel.

## Fast recovery after reboot

If the boot/watchdog setup below is installed, this should already happen automatically. Use this for manual recovery or after changing scripts.

On the host, from the deployed repo (normally `/root/repos/kerodi`):

```bash
cd /root/repos/kerodi
git pull --ff-only origin main
bash docs/tailscale/start-on-termux.sh
```

The script starts or verifies:

- `tailscaled`
- Jenkins
- Freerider push worker
- webhook-only proxy
- Tailscale Funnel on `8788`

It also prints Tailscale, Funnel, Jenkins, worker, and proxy status.

If you are not on the normal deployed branch, check out the intended branch before running the script.

## Remote recovery setup (one-time, on the host)

Do these steps once while you still have direct access to the host. After this you can recover from any device on the Tailnet.

### 1. Enable Tailscale SSH

On the host:

```bash
tailscale set --ssh
```

This is one-time per host. Tailscale SSH listens only on the Tailscale IP; it does not expose SSH through Funnel.

In the Tailscale admin console, ensure the tailnet policy permits SSH. If you have a custom policy, add or merge a rule like this:

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

`check` mode makes root SSH ask for re-authentication periodically. If your policy already has a working SSH rule, keep it.

### 2. Install boot autostart

Install the **Termux:Boot** add-on from F-Droid/Google Play, then open it once so Android registers it.

Copy the boot entrypoint:

```bash
mkdir -p "$HOME/.termux/boot"
cp /root/repos/kerodi/docs/tailscale/boot-start.sh "$HOME/.termux/boot/kerodi.sh"
chmod +x "$HOME/.termux/boot/kerodi.sh"
```

If your repo path is not `/root/repos/kerodi`, edit `KERODI_REPO_DIR` in `$HOME/.termux/boot/kerodi.sh`.

The boot script:

- takes a Termux wake lock
- waits 30 seconds for boot networking/storage
- launches `docs/tailscale/watchdog.sh`

### 3. Start the watchdog now

Do not wait for the next reboot:

```bash
nohup bash /root/repos/kerodi/docs/tailscale/watchdog.sh \
  > /root/.kerodi/watchdog.log 2>&1 &
```

The watchdog calls `start-on-termux.sh` every 60 seconds. Because that script is idempotent, it only starts services that are missing and restores Funnel if it is off.

To change the interval, set `KERODI_WATCHDOG_INTERVAL_SECONDS` before launching it.

### 4. Verify the setup

On the host:

```bash
pgrep -af 'docs/tailscale/watchdog.sh'
tail -n 30 /root/.kerodi/watchdog.log
tailscale status
tailscale funnel status
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8080/login >/dev/null && echo "Jenkins OK"
```

### 5. Recover remotely

From another Tailnet device:

```bash
ssh root@kerodi-android-build
bash /root/repos/kerodi/docs/tailscale/start-on-termux.sh
tail -n 50 /root/.kerodi/watchdog.log
```

If Tailscale itself is down, you cannot use Tailscale SSH. The boot script/watchdog are what make Tailscale come back automatically.

If the machine is powered off, software cannot wake it. You need Wake-on-LAN from another always-on device, or a smart plug configured so the machine boots when power returns.

## Manual start commands

If the script cannot be used, start services manually.

Tailscale:

```bash
mkdir -p /root/.kerodi /var/run/tailscale /var/lib/tailscale

nohup /usr/sbin/tailscaled \
  --tun=userspace-networking \
  --state=/var/lib/tailscale/tailscaled.state \
  --socket=/var/run/tailscale/tailscaled.sock \
  --port=41641 \
  > /root/.kerodi/tailscaled.log 2>&1 &
```

If Tailscale says it is logged out:

```bash
tailscale up --hostname=kerodi-android-build
```

Approve the printed URL in the Tailscale admin console if prompted.

Jenkins:

```bash
nohup java @/etc/jenkins/jvm.options \
  -Djenkins.model.Jenkins.slaveAgentPort=-1 \
  -DJENKINS_HOME=/var/lib/jenkins \
  -jar /opt/jenkins/jenkins.war \
  --httpPort=8080 \
  --httpListenAddress=0.0.0.0 \
  > /root/.kerodi/jenkins.log 2>&1 &
```

Freerider worker:

```bash
cd /root/repos/kerodi
SESSIONS_FILE=/root/.kerodi/freerider-sessions.json \
HISTORY_FILE=/root/.kerodi/freerider-history.json \
POLL_SECONDS=60 \
CONTROL_HOST=0.0.0.0 \
CONTROL_PORT=8787 \
  nohup node scripts/freerider-push-worker.mjs \
    > /root/.kerodi/worker.log 2>&1 &
```

Webhook-only proxy:

```bash
cd /root/repos/kerodi
KERODI_WEBHOOK_TOKEN_FILE=/root/.kerodi/jenkins-webhook-token \
KERODI_WEBHOOK_PROXY_PORT=8788 \
  setsid nohup node scripts/jenkins-webhook-proxy.mjs \
    > /root/.kerodi/jenkins-webhook-proxy.log 2>&1 < /dev/null &
```

Tailscale Funnel, if it is not already active:

```bash
tailscale funnel --bg --yes 8788
tailscale funnel status
```

Expected Funnel status:

```text
https://kerodi-android-build.tail8d2385.ts.net
|-- / proxy http://127.0.0.1:8788
```

## Verification checklist

Run these after recovery.

On the host:

```bash
tailscale status
tailscale funnel status
curl -fsS http://127.0.0.1:8080/login >/dev/null && echo "Jenkins OK"
curl -fsS http://127.0.0.1:8787/health && echo
pgrep -af 'jenkins-webhook-proxy.mjs'
tail -n 20 /root/.kerodi/jenkins-webhook-proxy.log
```

From another Tailnet device:

```bash
curl -fsS http://100.77.0.70:8787/health
curl -sS -o /dev/null -w '%{http_code}\n' http://100.77.0.70:8080
```

From a device outside the Tailnet:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://kerodi-android-build.tail8d2385.ts.net/login
curl -sS -o /dev/null -w '%{http_code}\n' https://kerodi-android-build.tail8d2385.ts.net/api/json
```

Both public Jenkins UI/API checks should return `404`.

To verify the GitHub webhook end to end, use GitHub → repository settings → Webhooks → latest delivery → **Ping** or send a ping from the GitHub API. The latest delivery should show status `OK` and response code `200`.

To verify the blocking check, open or synchronize a real PR. Its checks list should show `jenkins/android-apk` as pending, then successful or failed. Merge remains blocked until it is successful.

## GitHub webhook

Webhook ID on `FlyHighXX/kerodi`:

```text
717498860
```

Configuration:

```text
Events: pull_request
Actions that build: opened, reopened, synchronize
Content type: application/json
Target: https://kerodi-android-build.tail8d2385.ts.net/generic-webhook-trigger/invoke?token=<secret>
```

`closed`, `edited`, labels, comments, and other PR events are ignored.

When a PR event matches, Jenkins receives:

```text
BRANCH=<pull_request.head.ref>
HEAD_SHA=<pull_request.head.sha>
PR_NUMBER=<pull request number>
repo=FlyHighXX/kerodi
action=<pull_request action>
```

The Jenkins job checks out `refs/pull/<PR_NUMBER>/merge`, so fork PRs are supported while the PR is open.

## Blocking merges

Merging into `main` requires this status check:

```text
jenkins/android-apk
```

The job posts a `pending` status as soon as the webhook arrives, then replaces it with `success` or `failure` when the build finishes. Branch protection on `main` requires the check to be successful and requires the branch to be up to date. Admins are also subject to the check.

If the check never appears, the PR webhook was not delivered or the `HEAD_SHA` variable was not contributed. Check the latest delivery in GitHub and the Generic Webhook Trigger variables in Jenkins.

To verify branch protection after recovery:

```bash
# On the host, via Jenkins Script Console, or with GitHub CLI where available.
curl -sS \
  -H "Authorization: Bearer <GitHub PAT>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/FlyHighXX/kerodi/branches/main/protection
```

`required_status_checks.contexts` must include `jenkins/android-apk`.

## Jenkins job config

Job:

```text
kerodi-android-apk
```

Parameters:

| Parameter | Default | Purpose |
| --- | --- | --- |
| `BRANCH` | `main` | Branch for manual builds |
| `BUILD_DEBUG` | `false` | Normally leave off |
| `PR_NUMBER` | empty | Supplied by the webhook; empty for manual builds |
| `HEAD_SHA` | empty | PR head commit SHA supplied by the webhook; used for the blocking GitHub status |

Triggers:

- SCM polling: `H/3 * * * *` for merged `main`
- Generic Webhook Trigger for PR events

Credentials in Jenkins:

| ID | Purpose |
| --- | --- |
| `github-pat` | GitHub API and checkout |
| `expo-token` | EAS/expo token |
| `gwt-kerodi-android-apk` | Webhook token used by GitHub/Funnel proxy |

The job must not lose the `PR_NUMBER` parameter or the Generic Webhook Trigger. If rebuilding the job from scratch, recreate both.

## Token files and state files

Do not commit these.

```text
/root/.jenkins-env                       Jenkins user/API token for remote admin
/root/.kerodi/jenkins-webhook-token      Webhook token read by the proxy
/root/.kerodi/freerider-history.json     Authoritative Freerider history
/root/.kerodi/freerider-sessions.json    Current Freerider listener sessions
/root/.kerodi/worker.log                 Worker log
/root/.kerodi/jenkins-webhook-proxy.log  Proxy log
/root/.kerodi/jenkins.log                Jenkins log
```

If `/root/.kerodi/jenkins-webhook-token` is lost, recreate it from the Jenkins credential using **Manage Jenkins → Script Console**:

```groovy
import com.cloudbees.plugins.credentials.SystemCredentialsProvider
import com.cloudbees.plugins.credentials.domains.Domain

def store = SystemCredentialsProvider.instance.store
def cred = store.getCredentials(Domain.global()).find { it.id == 'gwt-kerodi-android-apk' }
if (cred == null) return 'credential not found'

def f = new File('/root/.kerodi/jenkins-webhook-token')
f.text = cred.secret.plainText + '\n'
['chmod', '600', f.absolutePath].execute().waitFor()
return 'wrote ' + f.absolutePath
```

Then restart the proxy.

## Common problems

### Jenkins is not reachable

Check the process and log:

```bash
pgrep -af 'jenkins.war'
tail -n 50 /root/.kerodi/jenkins.log
```

Start it manually with the Jenkins command above. Avoid `safeRestart` unless you are prepared to restart Jenkins manually; in this environment it has previously failed to relaunch cleanly.

### Webhook delivery times out or fails

Check, in order:

```bash
tailscale funnel status
pgrep -af 'jenkins-webhook-proxy.mjs'
tail -n 50 /root/.kerodi/jenkins-webhook-proxy.log
curl -fsS http://127.0.0.1:8080/login >/dev/null && echo "Jenkins OK"
```

Then send a fresh GitHub ping delivery. A redelivery of an old ping may still contain the old URL and is not a reliable test.

### Public Jenkins UI appears

The Funnel target should be `127.0.0.1:8788`, not `127.0.0.1:8080`. Fix with:

```bash
tailscale funnel --https=443 off
tailscale funnel --bg --yes 8788
tailscale funnel status
```

### PR build fails with `couldn't find remote ref refs/pull/N/merge`

That PR is closed or its merge ref was deleted. Open PRs have this ref. This is not a webhook configuration problem.

### Freerider history looks empty

Never delete `freerider-history.json`. The worker is the authoritative history store and the app keeps only a session cache.

## Notes

- Jenkins builds run shell commands as `root` on this host, so keep the public surface limited to the webhook proxy.
- Tailscale Funnel needs one-time approval per tailnet/node. If approval is lost, the CLI will print an approval URL.
- No subnet router is needed; Tailscale scope is only the host/Jenkins/worker.
- The Freerider worker has no auth beyond per-user push tokens; keep it Tailnet-only.
