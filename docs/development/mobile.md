# Expo mobile

`apps/mobile` is the iOS/Android client for Space Agents and their continuing
conversations. Every application screen requires a verified account session.
After sign-in, Agents opens for the selected Space; account details and sign-out
remain reachable. The client renders backend state and expresses intent. It does
not execute Agent tools or decide Space authorization. Push notifications and OTA
updates are not configured.

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

Native replies use `react-native-marked` from `catalog:mobile`; HTML is never
interpreted and no WebView is used. This adds no native module or requirement for
a new development build. Component tests use `react-test-renderer` at Mobile's
exact React version, its development types and Vitest native host mocks.

Copy `apps/mobile/.env.example` to `.env.local` in that workspace to override
`EXPO_PUBLIC_API_URL`. The default is `https://raypx.com`. Supply an HTTPS gateway
origin without a path, query or credentials; a development device must be able to
reach it. Expo embeds this public value at bundle time. Never put secrets in
`EXPO_PUBLIC_*`. The gateway must route `/api/auth/*`, `/rpc` and the authenticated
`/events` WebSocket to the API and serve the existing `/signup` and
`/forgot-password` Web pages.

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
the root boundary. A validated protected destination is restored after sign-in.
RPC session expiry and socket session expiry return to sign-in; loss of Space
membership refreshes the directory without treating it as account logout.
Server-side session and permission checks remain authoritative.
Sign-out clears the Expo cookie store and removes the protected route history.

Registration and password recovery open their existing Web flows in the system
browser. Return to the app after verifying an email or changing a password.
System locale chooses Chinese/English copy from the shared catalogs; system
appearance follows Uniwind's adaptive light/dark themes.

## Agents and conversations

Expo Router owns the protected routes:

| Route                               | Purpose                                                              |
| ----------------------------------- | -------------------------------------------------------------------- |
| `/`                                 | Agent list for the current Space, pull-to-refresh and account access |
| `/conversation/[agentId]?spaceId=…` | Agent conversation and team computer indicator                       |
| `/agent?spaceId=…`                  | Create an Agent                                                      |
| `/agent?spaceId=…&agentId=…`        | Edit an Agent                                                        |
| `/space`                            | Create the first or another Space                                    |
| `/account`                          | Existing account details and sign-out                                |

The Space switcher appears only when more than one membership is available. The
directory shows an initials avatar, Agent name and model. The current Agent list
contract has no conversation last-activity field; Agent `updatedAt` is labelled
as last edited. Forms use the server's offered models, including an explicit
empty catalog state. Deletion requires native confirmation and deletes the
conversation as the backend contract specifies.

`@raypx/agents/model` supplies page selection, snapshot/event application,
streamed-prefix reconciliation, cursor advancement, idempotent send receipts,
approval projection and computer lifecycle. Mobile supplies the model's ports;
it does not fork these rules or import `@raypx/agents/client`. RPC uses
`@raypx/client/api` with the current SecureStore-backed Expo session cookie and
the configured Origin. The native `/events` socket authenticates with headers;
credentials never enter its URL or logs. Durable events update projection and
cursor before ACK, reconnect resumes that cursor, and a gap or expired replay
window replaces state from a snapshot. Committed segments replace streamed text.

AppState closes the socket while inactive/backgrounded and resumes the retained
controller on foreground. Late frames and reads from the suspended connection
are fenced. Load, reconnect and foreground refresh pending approvals; computer
state refreshes on reconnect. Unsent drafts and frozen unconfirmed-send receipts
use existing SecureStore with origin/account/Space/conversation tuple keys encoded
to valid key characters. Restoring either never sends. Delivery retry reuses the
same idempotency key; failed-Run retry prepares text for an explicit new Send.
No message history or transient reply text is persisted on the device.

The conversation keeps a scrollable native Markdown transcript above a composer
with keyboard avoidance and safe-area insets. Run statuses include queued,
running, waiting, stopped, completed and each contract failure code. Stop is
available for an active Run. Approval cards display the bounded tool/target
summary, expiration and server resolution; addressed members can approve, deny
or remember the exact tool (and exact executable for commands). A pending card
does not block a new message. Unknown effect outcomes remain explicit and do not
offer an automatic failed-Run retry.

History uses the shared bounded paging controller, including an explicit load-earlier
action; it is independent of event replay cursors. Tool activity uses the shared
timeline and tool-call identity rather than a separate Mobile projection. Successful
Page-tool activity opens Page detail at the configured Web origin, falling back to
the Pages list when identity is absent. Handoff failures remain visible/retryable.
Mobile has no native Page editor, group/member management, routine or memory editor,
or account resource-settings workflow; those use Web/Desktop.

The compact header computer indicator opens a native Modal bottom sheet with
the team's lifecycle state, failure reasons and guarded start/stop controls.
Stop requires native confirmation; not configured is explicit and has no
lifecycle controls. The sheet uses static presentation so reduced motion needs
no extra animation path or native sheet dependency.

## Native components and styling

The mobile app uses HeroUI Native for buttons, form controls and loading indicators,
with Tailwind CSS 4 through Uniwind. Import components from their public subpaths
such as `heroui-native/button` and `heroui-native/input`; shared DOM UI remains
exclusive to Web/Desktop. The root layout mounts GestureHandlerRootView,
SafeAreaProvider, HeroUINativeProviderRaw and a portal host used by Select. The raw
provider supplies component configuration and system reduced-motion support.

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

English and Chinese compose the pure common, Auth and Agents catalogs. The app's
private `mobile` catalog owns mobile-only navigation/status copy; never import
shared DOM adapters or render content as raw HTML.

## Source verification

Run the workspace's `check`, `test` and `build` commands above, plus repository
`bun run check`, `bun run lint`, `bun run policy` and `bun run i18n:types` for
delivery. The production export is a JavaScript bundle check, not native or live
backend acceptance. Port unit tests cover native session headers, socket frames,
storage isolation and lifecycle resume. Native component tests cover the Agent
directory, conversation, approval card and computer sheet using Vitest and
`react-test-renderer` with native/HeroUI host mocks. Shared model tests remain
platform-neutral. These mocks do not prove native layout or accessibility.

Use the checked-in manifest and lockfile as the dependency inventory. Record the
actual source/test/export results for the candidate being delivered; earlier
implementation-environment restrictions are not current verification evidence.
Native platform acceptance remains independent of these commands.

## Device acceptance

On both iOS and Android, verify cold start without a session, invalid credentials,
unverified email, successful login, app restart with a saved session, foreground
refresh, loss of connectivity, expired/revoked sessions, sign-out, and a deep link
to a protected route. Check keyboard submission, password autofill, large text,
screen readers, Chinese/English copy and light/dark appearance.

For Agents, verify multiple Spaces and account switching, empty/offered model
catalogs, create/edit/delete, pull-to-refresh, long names/instructions and draft
isolation. Send a message, lose the response, explicitly retry delivery and
confirm that one message exists. Background during streaming and approval wait,
return to the foreground and verify replay without gaps/duplicates and final
committed text. Expire a session on the conversation route, sign in again and
verify the destination and unsent draft restore without sending. Resolve or
expire approvals from another client, approve/deny/remember a request, and send
while a card is pending. Verify computer states, not-configured behavior and
stop-confirmation cancellation/acceptance.

Check a small phone and tablet in portrait and landscape, safe-area cutouts,
keyboard opening/closing, large text, VoiceOver/TalkBack, reduced motion and
Markdown links/code/tables without raw HTML. Simulator and physical-device
acceptance, authenticated live WebSocket/listener checks, PostgreSQL and live
computer/provider checks have not been run for this mobile implementation.
Exported bundles and unit/component tests do not substitute for this acceptance.
