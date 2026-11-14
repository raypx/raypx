# mobile

## Purpose

Expo iOS/Android composition root for Space Agents, conversations and account
access. Every application screen requires login; execution stays on the backend.

## Interface

Expo Router owns `app/` routes. The root session boundary protects `(app)` and
exposes `/login` only while signed out. Session restoration, refresh failures,
expiry and verification must fail closed before protected screens mount.
Agents is the authenticated home. `/groups` and `/group-conversation/[groupId]`
provide structural mentions and attributed concurrent replies. `/space-settings`
provides members, roles, invitations and leave; `/join?token` previews and explicitly
accepts invitations after login. `/routines`, `/space-memory`, `/pages` and `/resources`
compose their shared feature models. Capability links without an Agent offer a chooser.
Pages use the configured Web origin without authenticated native document frames.
Resource definitions/credentials and HTTP API management remain Web/Desktop;
account skill/server enablement and Space availability switches are native.

`/conversation/[agentId]` selects a conversation
with `spaceId`; `/agent` creates or edits an Agent, `/space` creates a Space and
`/account` retains account/sign-out. Preserve validated return destinations across
session expiry. A route parameter is a selector, never authorization.
OTA updates are not configured; keep updates.enabled false until an update service is established.

Import `@raypx/agents/model` for page state, conversation/event projections,
idempotent sends, approvals and computer lifecycle. Never import its DOM client.
Mobile injects authenticated RPC, `/events`, device storage and AppState ports.
The foreground Space live controller reconciles membership even outside chat;
known Space close reasons route to the directory, session expiry to login.
Feature screens read the same session-fenced API client through the workspace;
never retain credentials in screen state.
Close the socket in the background; resume the retained projection/cursor on
foreground and refresh pending approvals and computer state. Apply durable events
before ACK; transient reply text never advances the cursor. No automatic send on
draft restoration or retry editing. Drafts and frozen uncertain-send receipts use
SecureStore with keys scoped by origin, account, Space and conversation. Do not
persist server history or live text as a second authority.

The shared model supplies the bounded Still working strip for outside-window
active Runs. Stop, addressed approvals and targeted Steer work before loading
history; the target remains visible/cancellable. Show Run loads the trigger's
bounded page and hides its strip row when the message is loaded. HTTP API tools
share the native activity/approval views with bounded operation labels and explicit
read/change classification. OpenAPI registration and credential management remain
in Web/Desktop Tools.

`EXPO_PUBLIC_API_URL` selects one HTTPS gateway origin (default `https://raypx.com`).
It is public build configuration, never a credential. SecureStore namespaces
session cookies by origin; do not store passwords or trust cached user profiles.
Email/password uses Better Auth's Expo client with the exact HTTPS server Origin.
Do not add OAuth/deep-link login without the matching server integration.

Use HeroUI Native for interactive controls and React Native for layout/text,
styled with Tailwind CSS 4 through Uniwind; never import shared DOM components.
Import components through their public subpaths. The root layout mounts a gesture
root, SafeAreaProvider, HeroUINativeProviderRaw and the Select portal host. The
provider respects system reduced motion. Computer controls use a native Modal
bottom sheet without animation; destructive deletion/stop use native confirmation.
Pending approval cards never disable the composer. Render replies as native
Markdown without raw HTML, WebViews or shared DOM components.
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
Vitest native component tests use the mobile React version with a test renderer
and native/HeroUI host mocks, alongside port and AppState resume tests. These do
not verify native layout, keyboard, accessibility or device socket behavior.
Markdown suites exercise the real parser and reply renderer. Keep its list/table
dependencies inside Vitest's module pipeline and select their native ESM/TS entries;
CommonJS `require` bypasses the native aliases. SVG stays a native host mock.
The model picker groups offered choices by source. Tool activity renders the shared
timeline's `activity` and `pendingCount`; approval rows render their single `card`.
The shared model owns lifecycle replay and toolCallId matching; never project
those events separately in Mobile. Page activity uses the server-produced ID to
open Web Page detail at the configured origin; missing identity opens the Pages
list. System handoff errors remain visible and retryable.
The manual Mobile build workflow verifies unsigned native builds on GitHub runners.
Mobile release uses EAS for signed builds. Both workflows configure generated native
projects to run Metro with Bun. Keep native projects ignored.

## Catalog composition

Statically compose common, Auth and Agents' pure English/Chinese catalogs in
private language entries; mobile-only copy belongs in `locales/{en,zh}/mobile.json`.
Never import DOM i18n adapters.

- Expo password login handles Better Auth TOTP and backup-code challenges.
