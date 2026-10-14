# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Wellbeing Insights (AI)

The **Insights** tab reads the notes you have written locally and asks an AI model to
surface recurring themes and patterns relevant to your wellbeing.

### How it works

- Notes are stored on-device (`AsyncStorage`, key `kerodi.notes.v1`) by the Notes tab.
- Nothing is sent anywhere until you open Insights and explicitly enable it (a one-time
  opt-in is stored under `kerodi.ai.consent.v1`), then tap **Generate insights**.
- Analysis can run in one of two modes:

  1. **Bring your own key (BYOK) — no server needed.** You paste your own provider
     API key into the Insights tab. It is stored in `expo-secure-store` (Android
     Keystore / iOS Keychain) and sent **only** to the provider you chose, directly from
     the device. No hosting, works from any network.
  2. **Hosted proxy — the key stays server-side.** If no key is stored on the device,
     the note text and dates are `POST`ed to `src/app/api/insights+api.ts`. That route
     holds the provider key, calls the model, and returns structured insights. The key
     is **never** shipped in the app bundle because it lives in a `+api.ts` route, which
     Expo strips from client code. This mode requires deploying the route somewhere.

- The provider metadata (`src/lib/ai-providers.ts`) and the prompt/response logic
  (`src/lib/insights-core.ts`) are isomorphic and shared by both modes, so they cannot
  drift apart.

> **Privacy note on BYOK:** since it is your own key, nothing of yours is exposed to
> anyone else. The key sits on your device in encrypted storage — it is only as safe as
> the device itself. For a free, no-billing key that is an acceptable trade.

### Choosing an AI provider

Both modes are provider-agnostic. In BYOK mode the provider is detected from the key
prefix (Groq keys start with `gsk_`, Gemini with `AIza`, …) and can be overridden in
the UI. In proxy mode, set a key for one provider; it is auto-detected
(order: `groq`, `gemini`, `openai`, `anthropic`), or set `INSIGHTS_PROVIDER` to
pick explicitly.

| Provider | Free tier | Trains/retains on your data? | Default model |
| --- | --- | --- | --- |
| `groq` (recommended) | yes | No by default; Zero Data Retention available | `openai/gpt-oss-120b` |
| `gemini` | yes | Free tier may use data to improve Google products | `gemini-3.8-flash` |
| `openai` | no | No | `gpt-4o-mini` |
| `anthropic` | no | No | `claude-sonnet-5` |

Because these notes are sensitive, `groq` is the default recommendation: it is
free and does not retain inference data by default. `openai` also works with any
OpenAI-compatible endpoint (OpenRouter, Cerebras, a local Ollama server) via
`INSIGHTS_BASE_URL`.

### Configuration

**BYOK needs no configuration at all** — just paste a key in the app. Everything below is
only for the optional hosted-proxy mode.

Copy `.env.example` to `.env.local` and set:

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `GROQ_API_KEY` (or `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) | server only | yes | Provider key for the proxy. Do **not** prefix with `EXPO_PUBLIC_`. |
| `INSIGHTS_PROVIDER` | server only | no | Force a provider instead of auto-detecting. |
| `INSIGHTS_MODEL` | server only | no | Override the model name. |
| `INSIGHTS_BASE_URL` | server only | no | Override the API base URL (OpenAI-compatible hosts, local Ollama). |
| `INSIGHTS_API_KEY` | server only | no | Generic key, used before the provider-specific one. |
| `EXPO_PUBLIC_INSIGHTS_API_URL` | client | for release native builds | Absolute endpoint URL, e.g. `https://your-server.example.com/api/insights`. On web and local dev the relative `/api/insights` route is used automatically. |

API routes require `web.output: "server"` (already set in `app.json`) on SDK 57.

### Local testing

```bash
# Bundles the server + API route and prints the route table
npx expo export -p web --no-ssg

# Serve the exported output and exercise the endpoint
npx expo serve
curl -X POST http://localhost:3000/api/insights \
  -H 'Content-Type: application/json' \
  -d '{"notes":[{"id":"1","text":"slept badly","createdAt":1700000000000}]}'
```

With no key configured the endpoint returns `503`; with a bad key the provider error is
returned as `502`.

### Deploying the endpoint for the Android APK

**Skip this entirely if you use BYOK** — with a key saved in the app, the native build
talks to the provider directly and needs no server.

The proxy is only needed when you want to keep the key server-side (for example, to
share one build with other people). The Android app is a native build with no ambient web
origin, so a relative `/api/insights` will not resolve. Deploy the server (e.g.
`eas deploy`, or any Node host) and do one of:

- set `EXPO_PUBLIC_INSIGHTS_API_URL` to the deployed endpoint before building, **or**
- configure the Expo Router `origin` in `app.json` (this part of Expo's server support is
  marked **alpha**).

Native release builds without either, and with no key saved, will show a "Could not
generate" error at runtime. With a key saved in the app, BYOK is used instead.

### Privacy

Enabling Insights sends your note text to the AI provider you chose. It is off by
default and can be turned off at any time from the tab. In BYOK mode the key and the
notes go only to that provider, straight from your device. The rest of the app keeps its
notes on-device.

## CI / builds

The Android APK is built automatically on the on-device Jenkins worker when a pull request is merged into `main`. PR branches can also be built on demand from Jenkins using the `BRANCH` build parameter.
