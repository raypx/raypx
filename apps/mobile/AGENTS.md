# mobile

## Purpose

Expo Router native iOS and Android application with account access and device
preferences. Expo Web is not a replacement for the separate DOM Web application.

## Interface

- `app/_layout.tsx` hydrates preferences before exposing screens.
- `app/index.tsx` owns account and authentication forms.
- `app/settings.tsx` owns language and appearance preferences.
- `src/account.ts` creates the SecureStore-backed native auth client and RPC SDK.
- `global.css` imports Uniwind and the native semantic theme entry from UI.

## Ownership

Own native screen composition and platform adapters. Native credentials live in
SecureStore; language and appearance preferences live in AsyncStorage.

## Constraints

- Expo SDK 57, React 19.2.3, React Native 0.86.3 and Uniwind.
- Uniwind is the sole native theme state. Do not add a DOM theme provider.
- Import UI through `@raypx/ui/theme` and `@raypx/ui/styles/native.css` only.
- Import locale hooks through `@raypx/i18n/native`, never browser storage adapters.
- Read current auth cookies for each RPC call; never capture initial credentials.
- Verification and reset links finish in Web, then users return to sign in.
- Use `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` for physical devices.
- Mobile bundling and doctor are explicit gates; native signing is not configured.
- Doctor scopes npm_config_force to its diagnostic child because Expo invokes
  read-only npm explain; normal npm installation remains blocked by devEngines.

See [foundation architecture](../../docs/architecture/0034-extensible-foundation.md).

## Verification

```sh
bun run --cwd apps/mobile check
bun run --cwd apps/mobile doctor
bun run --cwd apps/mobile bundle
```
