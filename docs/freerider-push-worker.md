# Freerider push worker

Low-traffic alerts are sent by the tiny worker in `scripts/freerider-push-worker.mjs`. The app does not poll hertzfreerider directly; it reads the worker's cached feed. One throttled poll serves all active listeners, Start baselines, and explicit checks; ordinary tab opens and filter changes use the cache only.

For reaching the worker from other networks, run it behind Tailscale and use a tailnet address in **Settings → Worker connection**. See [Tailscale setup](./tailscale-setup.md).

## 1. Run the worker

```bash
SESSIONS_FILE="./.freerider-sessions.json" \
HISTORY_FILE="./.freerider-history.json" \
POLL_SECONDS=60 \
CONTROL_PORT=8787 \
npm run freerider:worker
```

The worker listens on `0.0.0.0:8787` and exposes:

| Method | Path | Body | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | Health check |
| `GET` | `/routes` | — | Cached normalized feed only; bootstraps once if the worker has never fetched |
| `POST` | `/poll-now` | `{}` | Throttled manual refresh + alert processing for **Check now** |
| `POST` | `/` | `{ token, from, to }` | Legacy preferences ack from Settings; does not start a listener |
| `POST` | `/start` | `{ token, from, to, durationMinutes, excludeCountry? }` | Start a listener with a fresh baseline |
| `POST` | `/stop` | `{ token, id }` | Stop one listener |
| `GET` | `/history?since=<ms>` | — | Worker-owned history; returns records updated at or after `since`, or all records when omitted |
| `POST` | `/status` | `{ token, since? }` | List active listeners (legacy builds also receive history here) |

All fetches — scheduled polls, Start baselines, and **Check now** — share one throttle of `ROUTE_REFRESH_SECONDS` (default 60s). Normal app reads use `/routes` and do not fetch hertzfreerider. Scheduled polls add ±10% jitter. Feed errors back off exponentially up to `MAX_BACKOFF_SECONDS` (default 600s), and `Retry-After` is honoured. With one active listener this is about 1,440 hertz requests/day instead of 8,640.

Multiple listeners can run for the same token. One feed poll serves all active listeners, and matches are grouped into one push per user to avoid duplicates. `excludeCountry` (for example `"NO"`) suppresses alerts for routes whose pickup or return country matches, and is also returned in `/status` so the app can keep active listeners in sync with the setting.

While listeners are active, each poll also records detected route IDs in `HISTORY_FILE`. Routes that leave the feed are marked `unavailable` (or `expired` once their `expireTime` has passed). The worker is the single source of truth: the app fetches history through `/history` on each refresh, keeps it only in memory for the current session, and deletes the old device-owned history copy on first launch. This powers the route list and the **History** sheet without making history device-specific.

Each status change is appended to a per-route transition list: detected, unavailable, expired, or available again. Inactive rows are re-checked on every poll, so `unavailable` becomes `expired` when `expireTime` passes. The app keeps every recorded transition per route plus a lifetime reappearance count and total time unavailable; route rows themselves are never pruned. Past transitions cannot be backfilled — recording starts with this version.

A route that disappears and later returns sends **Freerider route available again** instead of the generic new-route alert. This also applies to routes that were present when the listener started. Reappearances are excluded from the new-route alert in the same poll and deduplicated per listener, so one return produces one push. Tap **View full history** (or the `Seen again` line) on a route card, or tap a route in the History sheet, to see its full transition timeline.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `POLL_SECONDS` | `60` | Listener poll interval and shared refresh throttle |
| `ROUTE_REFRESH_SECONDS` | same as `POLL_SECONDS` | Minimum seconds between any two hertz fetches |
| `MAX_BACKOFF_SECONDS` | `600` | Maximum backoff after repeated feed errors |
| `SESSIONS_FILE` | `./.freerider-sessions.json` | Session + seen-state file |
| `HISTORY_FILE` | `./.freerider-history.json` | Persistent worker-owned history file; use an absolute path in systemd |
| `CONTROL_PORT` | `8787` | HTTP control port |
| `CONTROL_HOST` | `0.0.0.0` | Bind address |
| `EXPO_PUSH_URL` | Expo Push API | Override for testing |

## 2. App configuration

The app starts with `http://100.77.0.70:8787` pre-filled in **Settings → Worker connection**, and any override is saved on the device. Tailscale must be connected on the device running the app; no worker token is needed. A build-time `EXPO_PUBLIC_FREERIDER_PUSH_ENDPOINT` can replace that default for custom builds.

The Freerider tab reads cached `/routes`; tab focus and filter toggles only re-filter the local list. **Check now** and pull-to-refresh use the throttled `/poll-now` endpoint, so the device never makes its own hertzfreerider request. The visible **Updated** time comes from the worker's `fetchedAt` (the last real Hertz fetch), so cache reads and throttled checks do not move it. The locations list is cached on device for seven days.

Use a Tailscale address when the app is not on the same LAN as the worker. In this setup, the worker and Jenkins share one host:

```text
Worker: http://100.77.0.70:8787
Jenkins: http://100.77.0.70:8080
```

Use `Test` in Settings to check the connection. Saved addresses work across builds; switching from a LAN address to a VPN or public address does not require a rebuild. Android cleartext traffic is enabled through `expo-build-properties` so plain HTTP to the worker is allowed.

In the app:

1. Open **Settings → Worker connection**; the worker URL is already filled in. Tap **Save** to keep it, or change it first.
2. Set From/To filters in Settings.
3. On the Freerider tab, tap **Start** next to the hidden duration control. The first time, Android asks for notification permission and the app registers the push token automatically.
4. Use `1h ▾` to choose the listener duration.
5. Tap **listening** to see and stop active listeners.

Starting a listener saves a baseline of current route IDs, so existing routes do not trigger an immediate new-route alert. If one of those routes later leaves and returns, it does trigger an available-again alert. The listener expires automatically when its duration ends.

## 3. Booking links

Route links open `hertzfreerider.se` in the in-app WebView and use the site’s own route card and **Book** button to enter the booking flow. No pickup time is preselected — the booking page opens on the time-selection step so you can choose it yourself. The site requires this route-selection step; a bare `/booking-flow#id=…` deep link redirects to the start page.

## 4. Notification tap

Tapping the push opens the Freerider tab.
