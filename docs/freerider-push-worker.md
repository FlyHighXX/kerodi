# Freerider push worker

Second-level alerts are sent by the tiny worker in `scripts/freerider-push-worker.mjs`. The app itself does not poll for alerts.

## 1. Run the worker

```bash
SESSIONS_FILE="./.freerider-sessions.json" \
HISTORY_FILE="./.freerider-history.json" \
POLL_SECONDS=10 \
CONTROL_PORT=8787 \
npm run freerider:worker
```

The worker listens on `0.0.0.0:8787` and exposes:

| Method | Path | Body | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | Health check |
| `POST` | `/start` | `{ token, from, to, durationMinutes }` | Start a listener with a fresh baseline |
| `POST` | `/stop` | `{ token, id }` | Stop one listener |
| `POST` | `/status` | `{ token, since? }` | List active listeners and route history updated after `since` |

Multiple listeners can run for the same token. One feed poll serves all active listeners, and matches are grouped into one push per user to avoid duplicates.

While listeners are active, each poll also records detected route IDs in `HISTORY_FILE`. Routes that leave the feed are marked `unavailable` (or `expired` once their `expireTime` has passed). The app syncs those records through `/status` on each refresh and merges them into its local history, which powers the **History** sheet on the Freerider tab.

Each status change is appended to a per-route transition list: detected, unavailable, expired, or available again. Inactive rows are re-checked on every poll, so `unavailable` becomes `expired` when `expireTime` passes. The app keeps the most recent 50 transitions per route plus a lifetime reappearance count and total time unavailable; route rows themselves are never pruned. Past transitions cannot be backfilled — recording starts with this version.

A route that disappears and later returns sends **Freerider route available again** instead of the generic new-route alert. This also applies to routes that were present when the listener started. Reappearances are excluded from the new-route alert in the same poll and deduplicated per listener, so one return produces one push. Tap a route in the History sheet to see its full transition timeline.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `POLL_SECONDS` | `10` | Fallback/new-session interval |
| `SESSIONS_FILE` | `./.freerider-sessions.json` | Session + seen-state file |
| `HISTORY_FILE` | `./.freerider-history.json` | Detected-route history file |
| `CONTROL_PORT` | `8787` | HTTP control port |
| `CONTROL_HOST` | `0.0.0.0` | Bind address |
| `EXPO_PUSH_URL` | Expo Push API | Override for testing |

## 2. App configuration

The worker address is saved on the device in **Settings → Worker connection**. There is no baked-in LAN address, because private addresses depend on the network the phone is on. A build-time `EXPO_PUBLIC_FREERIDER_PUSH_ENDPOINT` is used only as the initial value if one was provided.

Use the Tailscale address of the machine running the worker. In this setup, the worker and Jenkins share one host:

```text
Worker: http://100.77.0.70:8787
Jenkins: http://100.77.0.70:8080
```

Use `Test` in Settings to check the connection. Saved addresses work across builds; switching from a LAN address to a VPN or public address does not require a rebuild. Android cleartext traffic is enabled through `expo-build-properties` so plain HTTP to the worker is allowed.

In the app:

1. Open **Settings → Worker connection**, enter the worker URL, and tap **Save**.
2. Turn on **New-route alerts** to register a push token.
3. Set From/To filters in Settings.
4. On the Freerider tab, tap **Start** next to the hidden duration control.
5. Use `1h ▾` to choose the listener duration.
6. Tap **listening** to see and stop active listeners.

Starting a listener saves a baseline of current route IDs, so existing routes do not trigger an immediate new-route alert. If one of those routes later leaves and returns, it does trigger an available-again alert. The listener expires automatically when its duration ends.

## 3. Booking links

Route links open `hertzfreerider.se` in the in-app WebView and use the site’s own route card and **Book** button to enter the booking flow. No pickup time is preselected — the booking page opens on the time-selection step so you can choose it yourself. The site requires this route-selection step; a bare `/booking-flow#id=…` deep link redirects to the start page.

## 4. Notification tap

Tapping the push opens the Freerider tab.
