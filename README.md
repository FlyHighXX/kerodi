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
- On request, the note text and dates are `POST`ed to a server-side proxy at
  `src/app/api/insights+api.ts`. The proxy holds the provider key, calls the model, and
  returns structured insights. The key is **never** shipped in the app bundle because it
  lives in a `+api.ts` route, which Expo strips from client code.

### Configuration

Copy `.env.example` to `.env.local` and set:

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | server only | yes | Provider key for the proxy. Do **not** prefix with `EXPO_PUBLIC_`. |
| `INSIGHTS_MODEL` | server only | no | Override the model (default `claude-sonnet-5`). |
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

The Android app is a native build with no ambient web origin, so a relative
`/api/insights` will not resolve. Deploy the server (e.g. `eas deploy`, or any Node host)
and do one of:

- set `EXPO_PUBLIC_INSIGHTS_API_URL` to the deployed endpoint before building, **or**
- configure the Expo Router `origin` in `app.json` (this part of Expo's server support is
  marked **alpha**).

Native release builds without either will show a "Could not generate" error at runtime.

### Privacy

Enabling Insights sends your note text to the configured AI provider. It is off by
default and can be turned off at any time from the tab. The rest of the app keeps its
notes on-device.

## CI / builds

The Android APK is built automatically on the on-device Jenkins worker when a pull request is merged into `main`. PR branches can also be built on demand from Jenkins using the `BRANCH` build parameter.
