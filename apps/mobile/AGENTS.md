# mobile

## Purpose

Expo iOS/Android composition root. Account access always requires login; local
execution remains in the Desktop/CLI device host.

## Interface

Expo Router owns `app/` routes. The root session boundary protects `(app)` and
exposes `/login` only while signed out. Session restoration, refresh failures,
expiry and verification must fail closed before protected screens mount.
The first authenticated screen is the account shell; task/push features are later work.
OTA updates are not configured; keep updates.enabled false until an update service is established.

`EXPO_PUBLIC_API_URL` selects one HTTPS gateway origin (default `https://raypx.com`).
It is public build configuration, never a credential. SecureStore namespaces
session cookies by origin; do not store passwords or trust cached user profiles.
Email/password uses Better Auth's Expo client with the exact HTTPS server Origin.
Do not add OAuth/deep-link login without the matching server integration.

Use HeroUI Native for interactive controls and React Native for layout/text,
styled with Tailwind CSS 4 through Uniwind; never import shared DOM components.
Import components through their public subpaths. The root layout mounts a gesture
root, SafeAreaProvider and HeroUINativeProviderRaw; add portal/toast providers only
when a feature needs them. The provider respects system reduced motion.
Import `src/global.css` once in the root layout.
Use `className`, `contentContainerClassName` and color prop class names; wrap
third-party native components with `withUniwind` when they need style adaptation.
The CSS entry imports HeroUI styles then UI's generated `themes/native.css` and
maps HeroUI's semantic variables to Raypx tokens (accent → primary,
muted → muted-foreground) in both theme variants. Keep color aliases static so
HeroUI's runtime color hooks can read them. Do not duplicate tokens or add feature-specific CSS
selectors. System appearance is Uniwind's default.
Only pure UI theme tokens and the original logo may cross from UI. Reuse Auth's
platform-neutral hooks and i18n catalogs. System language and appearance are defaults.

## Verification

Use Bun 1.4.4 for scripts. Turbo schedules check/test/build; Expo owns Metro bundling.
React and its types use catalog:mobile at Expo's supported version independently
of DOM applications. Metro resolves React/JSX imports from shared source through
Mobile's own dependency, preserving one native React instance.
Mobile dependencies use catalog:mobile; shared runtime libraries use catalog:
and build/test tools use catalog:dev. Keep native versions aligned with Expo's SDK.
Check dependency alignment with `bun --bun expo install --check` in this workspace.
Build exports both native JS bundles; its cache key tracks the `EXPO_PUBLIC_*`
variables Expo inlines. Generated native projects, Expo caches and bundles are not source.
Prefer TypeScript for handwritten code and executable configuration. Keep static
Expo metadata in `app.json`; CSS and generated declarations retain their native formats.
`metro.config.cjs` is only a one-line loader: Expo 58's config evaluator cannot
parse TS/ESM under Bun, so it delegates the typed config to Bun's native TS loader.
`metro.config.ts` resolves this app's and shared packages' relative `.js` ESM imports
to their TypeScript sources; keep this remapping out of dependencies in `node_modules`.
Wrap the configured resolver with `withUniwindConfig` last. Its type generation
stays under ignored `.expo/`; static `uniwind/types` also makes clean checks work.
Run `bun run --cwd apps/mobile check`, `test`, and `build`; device acceptance is separate.

## Catalog composition

Statically compose common and auth in private language entries; never import DOM
i18n adapters or other product catalogs.
