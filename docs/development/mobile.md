# Expo mobile

`apps/mobile` is the iOS/Android client for Space Agents and their continuing
conversations. Every application screen requires a verified account session.
After sign-in, Agents opens for the selected Space; account details and sign-out
remain reachable. The client renders backend state and expresses intent. It does
not execute Agent tools or decide Space authorization. Push notifications and OTA
updates are not configured.

Native Mobile provides team computer lifecycle and stop confirmation, but no
Screen view, graphical input or takeover controls. Use the phone Web client for
those workflows. This omission does not remove native groups, Space membership,
routines, memory, resource availability, activity or approvals; the exact native,
read-only and Web-handoff coverage is in [Product](../../PRODUCT.md#operating-context).

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

| Route                                     | Purpose                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `/`                                       | Agent list for the current Space, pull-to-refresh and account access    |
| `/conversation/[agentId]?spaceId=…`       | Agent conversation and team computer indicator                          |
| `/agent?spaceId=…`                        | Create an Agent                                                         |
| `/agent?spaceId=…&agentId=…`              | Edit an Agent                                                           |
| `/space`                                  | Create the first or another Space                                       |
| `/account`                                | Existing account details and sign-out                                   |
| `/groups?spaceId=…`                       | Group list and create/rename/participation management                   |
| `/group-conversation/[groupId]?spaceId=…` | Group conversation, mentions and attributed concurrent replies          |
| `/space-settings?spaceId=…`               | Members, roles, invitations, leave and effective approval mode          |
| `/join?token=…`                           | Preview and explicitly accept a single-use invitation                   |
| `/routines?spaceId=…&agentId=…`           | Routine list/editor/history and ingress copying                         |
| `/space-memory?spaceId=…&agentId=…`       | Agent/shared Markdown documents, revisions and restore                  |
| `/pages?spaceId=…`                        | Read-only directory with Web Page handoff                               |
| `/resources?spaceId=…&agentId=…`          | Skill/server catalogs, enablement and availability; owner API inventory |

The Space switcher appears only when more than one membership is available. The
directory shows an initials avatar, Agent name, model and the server's nullable
conversation `lastActivityAt`. Forms use the server's offered models, including an
explicit empty catalog state. Deletion requires native confirmation and deletes the
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

Active Runs outside the loaded message window remain in a bounded Still working
strip above the composer, with Agent attribution, state and origin/untrusted
markers. Stop, addressed approvals and targeted Steer work without loading history;
the steering target stays visible and cancellable. Show Run loads its triggering
message page and hides the strip row when that message is loaded. Truncated
summaries offer an explicit refresh. The shared model owns this projection.

HTTP API tools show readable operation labels, method and read/change
classification in activity and approval cards. Space owners manage OpenAPI
documents, write-only credentials, operation selections and Agent availability in
Web/Desktop; the native client does not provide that management surface.

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
Native Page viewing always hands off to Web; no authenticated Page document frame
or WebView is mounted. The Page URL uses only the configured origin, selected Space
and server-provided Page identity, never a display target or credential.

The compact header computer indicator opens a native Modal bottom sheet with
the team's lifecycle state, failure reasons and guarded start/stop controls.
Stop requires native confirmation; not configured is explicit and has no
lifecycle controls. The sheet uses static presentation so reduced motion needs
no extra animation path or native sheet dependency.

## Everyday workflow coverage

The [Mobile coverage matrix](../../PRODUCT.md#operating-context) is the exact
native/read-only/Web split. Native screens compose `@raypx/agents/model`,
`@raypx/jobs/model`, `@raypx/memory/model`, `@raypx/pages/model` and
`@raypx/skills/model`; no DOM adapters or backend execution enter the bundle.
The shared Agent model additionally exports its existing mention helpers and
Space live controller. Web/Desktop behavior remains unchanged.

Groups use explicit suggestion selections to create structural mention tokens.
Typing an Agent name alone never selects a recipient. Suggestions include only
current group Agents; history retains member names after departure. Concurrent
replies and Stop/Steer actions identify the exact Agent/Run. Child work stays
under parent activity, with its Agent and status. Effects open a lazy read-only
inspector with explicit unknown outcomes and refresh; inspection never replays work.

Shared Space settings show current roles and effective approval mode/source.
Owners can change roles, remove members, create and revoke invitations. Leaving
requires native confirmation. Copied invitation links use
`raypx-mobile://join?token=…`; sign-in preserves only a bounded validated token,
and acceptance always requires a separate press. One-time invitation values clear
on close. Space subscriptions run while foregrounded, including outside chat;
removed/left/deleting reasons return to the directory, session expiry returns to
sign-in, and fresh membership remains authoritative. Backgrounding closes streams.

Routines support all shared trigger form fields, including cron/time zone,
next occurrences, pause/resume, explicit run now and history. Copy uses only
server-provided ingress metadata, including explicit unavailable reasons; the
client never constructs an address from a key. Creation-only keys are transient
and clear when the editor closes. History links open the Agent conversation;
trigger-page jumps are available for Runs in its retained/active projection.
Group capability links offer an Agent chooser before opening per-Agent tools.

Memory lists Agent and shared Space documents. Native Markdown editing and safe
preview support pinning, removal, revisions, restoration and conflict reload with
the draft retained. Server history is never persisted on the device.

Skills and remote server definitions are read-only. Per-Agent enablement and
account resource all/selected Space availability are native switches. Turning
All Spaces off explicitly keeps only this Space; toggling a selected Space keeps
other selections. Space-created skill availability stays read-only. HTTP API
inventory is owner-only and read-only; selected operation labels, read/change
classification and Agent availability are visible. Imports, definitions,
credentials, operation selection, API availability and deletion remain Web/Desktop.
The native management action opens Web Tools; Pages open Web for viewing/editing,
versions, restoration and sharing, without forwarding the native session cookie.
Model connections, approval-rule management, Space rename/delete and full audit
also remain Web/Desktop.

Lists and transcripts use native virtualization; forms use keyboard avoidance,
safe areas, wrapping text and bounded tablet widths. Controls retain native
Dynamic Type, neutral system light/dark tokens, accessibility labels/roles and
reduced-motion presentation. Errors and reconnect state have explicit refresh
controls. Source mocks verify state and interaction, not on-device geometry or
screen-reader behavior.

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

English and Chinese compose the pure common, Auth, Agents, routines, memory,
Pages and skills catalogs, plus private native capability/resource catalogs. The app's
private `mobile` catalog owns mobile-only navigation/status copy; never import
shared DOM adapters or render content as raw HTML.

## Source verification

Run the workspace's `check`, `test` and `build` commands above, plus repository
`bun run check`, `bun run lint`, `bun run policy` and `bun run i18n:types` for
delivery. The production export is a JavaScript bundle check, not native or live
backend acceptance. Port unit tests cover native session headers, socket frames,
storage isolation and lifecycle resume. Native component tests cover the Agent
directory, conversation, the outside-window strip, HTTP API activity, approval
cards and computer sheet using Vitest and `react-test-renderer` with native/HeroUI
host mocks. Additional suites cover groups/structural mentions, shared Spaces,
invitation acceptance, effects inspection, routines, memory revisions/restore,
Pages and resource enablement/availability. Shared model tests remain
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
stop-confirmation cancellation/acceptance. Reload with an old Run waiting outside
the recent window; approve, stop or steer from Still working, then load its trigger
page and check that the strip row disappears. Check long Agent names and pending
cards above the keyboard. Exercise HTTP API read/change labels and addressed
approvals after enabling operations in Web/Desktop.

Check a small phone and tablet in portrait and landscape, safe-area cutouts,
keyboard opening/closing, large text, VoiceOver/TalkBack, reduced motion and
Markdown links/code/tables without raw HTML. Simulator and physical-device
acceptance, authenticated live WebSocket/listener checks, PostgreSQL and live
computer/provider checks have not been run for this mobile implementation.
Exported bundles and unit/component tests do not substitute for this acceptance.
