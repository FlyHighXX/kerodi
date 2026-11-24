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

The app talks to the worker at `EXPO_PUBLIC_FREERIDER_PUSH_ENDPOINT`. It defaults to:

```text
http://192.168.1.39:8787
```

Set that environment variable at build time to use a different host.

In the app:

1. Open **Settings** and turn on **New-route alerts** to register a push token.
2. Set From/To filters in Settings.
3. On the Freerider tab, tap **Start** next to the hidden duration control.
4. Use `1h ▾` to choose the listener duration.
5. Tap **listening** to see and stop active listeners.

Starting a listener saves a baseline of current route IDs, so existing routes do not trigger alerts. The listener expires automatically when its duration ends.

## 3. Notification tap

Tapping the push opens the Freerider tab.
