# Freerider push worker

The app's background task is only a slow fallback. For second-level alerts, run the tiny worker in `scripts/freerider-push-worker.mjs` on any machine with Node 18+.

## 1. Get the push token

In the app, open the **Freerider** tab and turn on **New-route alerts**. With no worker endpoint configured, the app shows an Expo push token. Copy it.

> This requires a native build with EAS push credentials configured. Expo Go cannot register a push token.

## 2. Run the worker

```bash
EXPO_PUSH_TOKEN="ExpoPushToken[...]" \
FROM="Stockholm" \
TO="Göteborg" \
POLL_SECONDS=10 \
npm run freerider:worker
```

The first run only saves a baseline of current route IDs to `.freerider-seen.json`; it does not notify. Later runs send one Expo push when a new route matches both filters.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `EXPO_PUSH_TOKEN` | required | Token shown in the app |
| `FROM` | `''` | Pickup place substring; empty matches all |
| `TO` | `''` | Return place substring; empty matches all |
| `POLL_SECONDS` | `10` | Check interval |
| `SEEN_FILE` | `./.freerider-seen.json` | Local state file |
| `EXPO_PUSH_URL` | Expo Push API | Override for testing |

`FROM`/`TO` use the same case- and diacritic-insensitive matching as the app, so `Göteborg` and `Goteborg` both work.

## 3. Notification tap

Tapping the push opens the app on the Freerider tab, where the matching route is marked **NEW**.

## Optional: auto-upload token and filters

If you set:

```bash
EXPO_PUBLIC_FREERIDER_PUSH_ENDPOINT=https://your-endpoint.example/freerider/preferences
```

the app POSTs `{ token, from, to }` there when alerts are enabled or filters change. That endpoint is intentionally not included in this minimal single-user setup; the worker above reads its config from environment variables.
