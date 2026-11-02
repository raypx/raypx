# mobile

## Purpose

Expo iOS/Android composition root. Account access always requires login; local
execution remains in the Desktop/CLI device host.

## Interface

Expo Router owns `app/` routes. The root session boundary protects `(app)` and
exposes `/login` only while signed out. Session restoration, refresh failures,
expiry and verification must fail closed before protected screens mount.
The first authenticated screen is the account shell; task/push features are later work.

`EXPO_PUBLIC_API_URL` selects one HTTPS gateway origin (default `https://raypx.com`).
It is public build configuration, never a credential. SecureStore namespaces
session cookies by origin; do not store passwords or trust cached user profiles.
Email/password uses Better Auth's Expo client with the exact HTTPS server Origin.
Do not add OAuth/deep-link login without the matching server integration.

Use native React Native controls with Tailwind CSS 4 utilities through Uniwind;
never import shared DOM components. Import `src/global.css` once in the root layout.
Use `className`, `contentContainerClassName` and color prop class names; wrap
third-party native components with `withUniwind` when they need style adaptation.
The CSS entry imports UI's generated `themes/native.css`; do not duplicate tokens
or add feature-specific CSS selectors. System appearance is Uniwind's default.
Only pure UI theme tokens and the original logo may cross from UI. Reuse Auth's
platform-neutral hooks and i18n catalogs. System language and appearance are defaults.

## Verification

Use Bun 1.4.4 for scripts. VP registers check/test/build; Expo owns Metro bundling.
Build exports both native JS bundles and is uncached because Expo consumes public
environment variables. Generated native projects, Expo caches and bundles are not source.
Prefer TypeScript for handwritten code and executable configuration. Keep static
Expo metadata in `app.json`; CSS and generated declarations retain their native formats.
`metro.config.cjs` is only a one-line loader: Expo 58's config evaluator cannot
parse TS/ESM under Bun, so it delegates the typed config to Bun's native TS loader.
`metro.config.ts` resolves shared packages' relative `.js` ESM imports to their
TypeScript sources; keep this remapping out of dependencies in `node_modules`.
Wrap the configured resolver with `withUniwindConfig` last. Its type generation
stays under ignored `.expo/`; static `uniwind/types` also makes clean checks work.
Run `bun run --cwd apps/mobile check`, `test`, and `build`; device acceptance is separate.
