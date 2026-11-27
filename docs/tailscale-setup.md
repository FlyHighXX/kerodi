# Tailscale setup for Kerodi

One tailnet connects the Kerodi infrastructure so the **Freerider push worker**
and the **Jenkins CI setup** are reachable from anywhere, without exposing
anything to the public internet.

```text
  your laptop / admin device          phones running the Kerodi app
  (Jenkins UI, health checks)         (worker connection in Settings)
            |                                    |
            +------------- tailnet (Tailscale) ---+
                                  |
        +-------------------------+--------------------------+
        |                         |                          |
  freerider worker :8787    jenkins controller         android build host
  (tag:freerider-worker)    :8080 / :50000             (tag:jenkins-agent,
                            (tag:jenkins-controller)     tag:freerider-worker)
                                  ^                          |
                                  +---- inbound JNLP agent --+
```

The worker control API is **the only thing the app needs**. Jenkins uses a
separate path: the on-device build agent connects *outbound* to the controller
on port `50000`, so no inbound firewall hole is needed on the phone.

---

## 1. Prepare the tailnet (admin console)

1. Go to <https://console.tailscale.com/admin> and enable **MagicDNS** under
   *DNS*. This gives every node a stable name like `kerodi-jenkins.tailnet-name.ts.net`.
2. Open *Access controls* and paste [`acl.hujson`](./tailscale/acl.hujson).
   It defines four tags and deny-by-default rules. Adjust `autogroup:owner`
   only if someone else should administer the hosts.
3. Create **auth keys** under *Settings → Auth keys*. Use one key per host,
   **single-use, non-reusable**, with the matching tag:

   | Host | Tag | Notes |
   | --- | --- | --- |
   | Freerider worker host | `tag:freerider-worker` | May be the same device as the build host |
   | Jenkins controller | `tag:jenkins-controller` | Cloud VM or on-prem server |
   | Android build host | `tag:jenkins-agent`, `tag:freerider-worker` | Pre-authorized keys avoid device approval prompts |
   | Your admin devices | none | Sign in normally with your account |

   Copy each key into a password manager. **Never commit auth keys to this repo.**
4. Consider disabling key expiry for the tagged service devices, or set a
   calendar reminder to re-authenticate them before expiry.
5. Devices joined with a normal login (not a tagged auth key) must be tagged in
   the admin console: **Machines → kerodi-android-build → Tags**. Without this,
   `tag:`-based ACL rules match nothing and access is denied.

---

## 2. Install on Linux hosts

On the Jenkins controller and any Linux machine that runs the push worker:

```bash
TS_AUTHKEY=tskey-auth-... \
TS_HOSTNAME=kerodi-jenkins \
TS_TAGS=tag:jenkins-controller \
bash docs/tailscale/install-linux.sh
```

The script uses Tailscale's official installer, joins the tailnet with the
supplied key, and prints the node's `100.x.y.z` address. Verify with:

```bash
tailscale status
tailscale ping kerodi-jenkins
```

If you prefer to do it by hand:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-auth-... --hostname=kerodi-jenkins \
  --advertise-tags=tag:jenkins-controller
```

---

## 3. The Android / Termux build host

This repository is checked out on an Android phone under Termux with a proot
Ubuntu container. Two options:

### Option A — Tailscale Android app (recommended if the Kerodi app itself needs tailnet access)

Install Tailscale from the Play Store, sign in with your account, and give the
device both tags in the admin console. A VPN app on Android routes traffic for
**all** apps on the phone, so the Kerodi app can reach tailnet addresses
directly. `pm install` from a Termux shell is not permitted (the shell runs as
an ordinary app UID); use the Play Store or an ADB host. The official release
APK has been saved on this device at `/root/tailscale-android.apk`:

```bash
adb install /root/tailscale-android.apk   # run from a host connected to the phone
```

### Option B — Linux client inside proot (what is configured here)

proot cannot load a kernel TUN device, so the daemon must use userspace
networking:

```bash
/usr/sbin/tailscaled \
  --tun=userspace-networking \
  --state=/var/lib/tailscale/tailscaled.state \
  --socket=/var/run/tailscale/tailscaled.sock \
  --port=41641 &

tailscale up --hostname=kerodi-android-build
# visit the URL it prints, then approve the device in the admin console
```

[`start-on-termux.sh`](./tailscale/start-on-termux.sh) starts Tailscale,
Jenkins, the push worker, the webhook proxy, and Funnel. It is safe to re-run.
Inbound connections to local services over the tailnet work; outbound traffic
from **other Android apps** does not automatically use the tunnel — use Option
A if the app on this phone must reach other tailnet nodes.

For automatic recovery after reboot or process crashes, install
[`boot-start.sh`](./tailscale/boot-start.sh) with Termux:Boot and run
[`watchdog.sh`](./tailscale/watchdog.sh). See the
[always-on host runbook](operations/README.md#remote-recovery-setup-one-time-on-the-host)
for Tailscale SSH setup and the exact host-side steps.

### Current deployment

| Item | Value |
| --- | --- |
| Node / Tailscale IP | `kerodi-android-build` — `100.77.0.70` |
| MagicDNS | `kerodi-android-build.tail8d2385.ts.net` |
| Tailnet suffix | `tail8d2385.ts.net` |
| Push worker | `http://100.77.0.70:8787` on Tailnet (or MagicDNS); LAN `http://10.0.0.8:8787` when on the same network |
| Other observed node | `diacos-s25` — `100.99.130.86` |

The node joined successfully and `tailscale ping` reaches `diacos-s25` via
DERP. Verify the worker from a device other than the build host:

```bash
curl -fsS http://100.77.0.70:8787/health   # -> {"ok":true,"sessions":0}
```

---

## 4. Freerider push worker

The worker is `scripts/freerider-push-worker.mjs`; see
[the worker docs](../freerider-push-worker.md) for its API. It has no built-in
authentication beyond the per-user push token, so keep it behind Tailscale.

On a Linux host, install [`kerodi-worker.service`](./tailscale/kerodi-worker.service)
as described in the file. On the Termux host use the start script above.

The app is pre-filled with `http://100.77.0.70:8787` on fresh installs and stores
any override per device in **Settings → Worker connection**. Tailscale must be
connected; no worker token is needed. The MagicDNS address also works:

```text
http://kerodi-android-build.tail8d2385.ts.net:8787
```

or the node's `100.x.y.z:8787` address. Tap **Test** to verify. Saved addresses
survive rebuilds, so switching from a LAN IP to a Tailscale name does not
require a new APK. If the app runs on the *same* device as the worker,
`http://127.0.0.1:8787` is simpler and needs no tunnel.

Verify from any other tailnet node:

```bash
curl -fsS http://kerodi-worker.tailnet-name.ts.net:8787/health
```

---

## 5. Jenkins

- Controller UI: `http://kerodi-jenkins.tailnet-name.ts.net:8080`
- Inbound agents: TCP `50000` (only `tag:jenkins-agent` is allowed by the ACL)

Launch the on-device agent with the tailnet URL, e.g.:

```bash
java -jar agent.jar -url http://kerodi-jenkins.tailnet-name.ts.net:8080/ \
  -secret <JENKINS_AGENT_SECRET> -name kerodi-android-build -workDir /root/jenkins
```

The agent initiates the connection, so the phone needs no open inbound port.
Keep the Jenkins UI restricted to the admin rule in the ACL; if you want HTTPS
for the UI, put a reverse proxy with a certificate in front of it rather than
publishing port 8080.

For the current deployment, GitHub PR webhooks reach Jenkins through a
webhook-only proxy on `127.0.0.1:8788`, which is the only service published
through Tailscale Funnel. The Jenkins UI and API stay private. See the
[always-on host runbook](operations/README.md) for startup, verification, and
recovery steps.

---

## 6. Verification checklist

- [ ] `tailscale status` on every node shows `active; direct` or `relay`.
- [ ] `tailscale ping <node>` succeeds between the agent and the controller.
- [ ] `curl .../health` on the worker returns OK from an admin device.
- [ ] Settings → Worker connection → **Test** succeeds in the app.
- [ ] Jenkins shows `kerodi-android-build` as online.
- [ ] Merging a PR into `main` still produces an APK.

## 7. Notes and troubleshooting

- ACLs are **directional**: allowing the agent to reach the controller does not
  allow the controller to reach the agent. The template adds a separate SSH rule.
- New nodes that use a pre-authorized tagged key skip the approval step;
  untagged devices must be approved in the admin console.
- If `tailscale ping` works but a service does not, check the listener's bind
  address: `CONTROL_HOST=0.0.0.0` (or `127.0.0.1` when using userspace networking
  on the same host) and confirm the port matches `CONTROL_PORT`.
- In proot, `systemctl` may show a Tailscale service, but it does not actually
  run; start the daemon with the command in section 3 instead.
- The push worker's control endpoints are HTTP by design; the encryption and
  access control come from Tailscale. Do not expose port 8787 on the public
  internet.
