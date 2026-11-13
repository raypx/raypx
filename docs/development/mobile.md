# Expo mobile

`apps/mobile` is the iOS/Android account client. Unlike Desktop's device-local
workspace, every mobile application screen requires a verified account session.
The current baseline contains email/password login and a protected account screen
with sign-out. Remote task views, approvals and push notifications are later work.

## Development

Use the repository-pinned Bun 1.4.4 runtime:

```sh
bun install
bun run dev:mobile
bun run --cwd apps/mobile check
bun run --cwd apps/mobile test
bun run --cwd apps/mobile build
```

The dev task opens Expo's Metro server. Run an iOS/Android development build or
scan its QR code in a compatible Expo Go version. The build task exports both
native JavaScript bundles into `apps/mobile/dist`; it does not compile, sign or
publish native application binaries. Linux cannot verify iOS simulator behavior.

Mobile's React and types use the `mobile` catalog at Expo's supported version
(currently 19.3.0), independently of the default DOM React/React DOM catalog.
Shared peer ranges must support both. Metro resolves React and JSX subpaths
through Mobile's dependency even when the importing source belongs to a shared
workspace. Expo, React Native, HeroUI Native, Uniwind and their native/UI peers
also use `catalog:mobile`. Better Auth and Tailwind CSS stay in the default catalog;
build/test tools use `catalog:dev`. After dependency changes, run
`bun --bun expo install --check` from `apps/mobile` to check the installed SDK
dependencies. Keep native modules within Expo's bundled version ranges.

Copy `apps/mobile/.env.example` to `.env.local` in that workspace to override
`EXPO_PUBLIC_API_URL`. The default is `https://raypx.com`. Supply an HTTPS gateway
origin without a path, query or credentials; a development device must be able to
reach it. Expo embeds this public value at bundle time. Never put secrets in
`EXPO_PUBLIC_*`. The gateway must route `/api/auth/*` to the API and serve the
existing `/signup` and `/forgot-password` Web pages.

## Build verification

Once the workflow is on the repository's default branch, open
**Actions → Mobile build → Run workflow** and select `all`, `ios` or `android`.
The workflow checks Mobile source and tests, then compiles an unsigned iOS Release
app for devices or an unsigned Android Release App Bundle for ARM64 on
GitHub-hosted runners. It needs no Expo project, Expo token or signing credentials.

## Release

Open **Actions → Mobile release → Run workflow** and select `all`, `ios` or
`android`. The workflow checks Mobile source and tests, then waits for EAS to
produce signed `.ipa` or `.aab` files and print download links. Enable `submit`
to send those builds to TestFlight or Google Play internal testing. Production
rollout is handled in the store consoles.

### Configure signed releases

1. From the repository root, link the app to its Expo project with the pinned EAS CLI.

   ```sh
   eas_version=$(bun -p 'require("./package.json").workspaces.catalogs.dev["eas-cli"]')
   cd apps/mobile
   bun x --bun "eas-cli@$eas_version" login
   bun x --bun "eas-cli@$eas_version" init
   ```

   Commit `app.json` with its Expo owner and `extra.eas.projectId`. Set
   `expo.version` in that file for the release.

2. Run an interactive build to provision signing credentials for each target.
   Use `--platform ios` or `android` to configure one platform. EAS manages and
   increments native build numbers.

   ```sh
   bun x --bun "eas-cli@$eas_version" build --profile production --platform all
   ```

3. Add the `EXPO_TOKEN` GitHub Actions secret for an account with access to the
   linked Expo project. If using a different public gateway, set
   `EXPO_PUBLIC_API_URL` in the Expo `production` environment.
4. For iOS submission, create the app in App Store Connect, add its numeric Apple
   ID as the `APP_STORE_CONNECT_APP_ID` Actions variable, and configure an App
   Store Connect API key in Expo. For Android submission, create the app in
   Google Play Console and assign its Google service account key in Expo.

See [Expo's CI setup](https://docs.expo.dev/build/building-on-ci/),
[iOS submission](https://docs.expo.dev/submit/ios/) and
[Android submission](https://docs.expo.dev/submit/android/).

## Authentication

The mobile composition root uses Better Auth's Expo client and SecureStore with
device-only, unlocked keychain accessibility. Storage keys are isolated by server
origin. Passwords exist only in form state and are cleared after successful login.
The client sends the configured HTTPS server Origin, already included in the
server's exact trusted-origin policy. Email/password does not need an OAuth
redirect or a new trusted custom URL scheme. Social authentication is not configured.

Session profile caching is disabled. The app checks the server during startup,
on foreground/network recovery through the Expo adapter, and periodically while
active. Restoration/refetch and network failures hide all protected screens.
Expired, missing or unverified sessions return to login; deep links cannot bypass
the root boundary. Server-side session and permission checks remain authoritative.
Sign-out clears the Expo cookie store and removes the protected route history.

Registration and password recovery open their existing Web flows in the system
browser. Return to the app after verifying an email or changing a password.
System locale chooses Chinese/English copy from the shared catalogs; system
appearance follows Uniwind's adaptive light/dark themes.

## Native components and styling

The mobile app uses HeroUI Native for buttons, form controls and loading indicators,
with Tailwind CSS 4 through Uniwind. Import components from their public subpaths
such as `heroui-native/button` and `heroui-native/input`; shared DOM UI remains
exclusive to Web/Desktop. The root layout mounts GestureHandlerRootView,
SafeAreaProvider and HeroUINativeProviderRaw. The raw provider supplies component
configuration and system reduced-motion support without unused toast/portal hosts.

`metro.config.ts` wraps the existing source resolver with `withUniwindConfig`.
The resolver maps relative `.js` imports in this app and shared workspace sources
to their TypeScript files, while preserving dependency resolution in `node_modules`.
Uniwind needs no Babel plugin; Expo's default Babel preset automatically enables
the installed Worklets plugin for Reanimated. Reanimated, Worklets, Gesture Handler
and SVG versions follow Expo's bundled native versions in the `mobile` catalog.
The one-line `metro.config.cjs` entry lets Bun load that typed configuration,
bypassing Expo 58's TS/ESM config evaluator, which fails under Bun.
The root layout imports `src/global.css` once. That entry registers mobile sources,
imports `heroui-native/styles`, then pure native theme variables from `@raypx/ui/themes/native.css`,
generated from UI's existing tokens by `bun run --cwd packages/ui generate:theme`.
Its native-only semantic mappings keep Raypx's neutral appearance: HeroUI's action
`accent` uses Raypx's `primary`, and HeroUI's text `muted` uses `muted-foreground`.
Surface, field, focus and danger variables also derive from shared tokens.
Define these mappings in both theme variants; common root variables do not override
Uniwind's theme-scoped values. Keep color aliases in a static theme block so
HeroUI's runtime color hooks can resolve them even without a matching utility.
Uniwind converts OKLCH colors for React Native and follows system appearance.

Use utilities such as `className="flex-1 bg-background"` on native components,
`contentContainerClassName` on ScrollView, and HeroUI's `useThemeColor` hook when a
native color prop is required.
Third-party components such as SafeAreaView use `withUniwind` for prop adaptation.
Keep feature layout in utilities; CSS contains imports, source declarations and
semantic theme mappings. Use native style props only for APIs that require them,
such as the navigation stack's background. One rem is configured as 16 native units.

Uniwind's generated theme types stay in ignored `.expo/`; `tsconfig.json` loads
`uniwind/types` directly so type checking also works before Metro has run.

## Device acceptance

On both iOS and Android, verify cold start without a session, invalid credentials,
unverified email, successful login, app restart with a saved session, foreground
refresh, loss of connectivity, expired/revoked sessions, sign-out, and a deep link
to a protected route. Check keyboard submission, password autofill, large text,
screen readers, Chinese/English copy and light/dark appearance. Exported bundles
and unit tests do not substitute for this acceptance.
