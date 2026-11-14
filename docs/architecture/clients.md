# Clients

Web and Desktop show the same Agents and state through shared contracts. Mobile
shares Core, contracts and feature models for its native Space and Agent workflows.
Native Screen viewing/input remains unavailable; the phone Web client provides it.
An implemented workflow works on each client or degrades for a stated reason.

## Shared layers

- Core owns schemas and pure rules. Contracts composes the oRPC definitions.
- A feature's model entry owns page state and injected view ports. Its client
  entry adapts that model to React.
- Clients call oRPC for commands and reads, and follow the
  [event stream](events.md) for everything that changes.
- A client never decides authorization. Hiding a control is a display hint; the
  backend checks every request.
- Unsent text is a draft kept on the device, isolated by Space and conversation.
  Restoring a draft never sends it.

`@raypx/agents/model` owns Space/Agent page selection, the conversation projection,
the applied cursor, Space computer state and injected read, command, stream and
draft ports.
`@raypx/agents/client` adapts them to React for `/agents`, the signed-in home in
Web and Desktop. Project/session pages, Waiting, New session and guest task drafts
are removed, together with dependent Automations and Desktop project tools.
Account/security, administration/configuration, authentication, public Web pages
and device preferences remain. Agent/Space memory uses the server-owned repositories
and opens from the conversation capability surface.
The single sidebar owns direct Agents, groups, the compact Space switcher and
Recent conversations. Recent is derived from existing list lastActivityAt
projections, without another persisted history or authorization boundary. Plain
New opens the home composer and uses the last used or chosen Agent. Agent/group
creation stays in their sections; an empty Space has one first-Agent action.
Routines, Pages and Tools remain reachable above the directory; the account and
owner invitation actions stay below it. Search targets current destinations.
An account without a Space first gets New Space. Agent forms use the backend's
offered models and show an explicit unavailable state for an empty catalog.

At /agents without a selection, the shared client shows a centered question and
composer. Sending opens the chosen Agent's continuing conversation using the
existing idempotent message port. The selected conversation fills the remaining
canvas; there is no second Agent/group column. A sticky title bar switches
Conversation, Activity and Files. The centered transcript uses member bubbles,
plain Agent Markdown and expandable real steps. A floating composer keeps active
Runs and pending approvals close to input. Wide layouts add context cards for
Computer/Screen, approvals and routines/memory; narrow layouts keep sheets and
explicit Back navigation. No synthetic activity or follow-up data is introduced.

Addressed protected-input requests remain independent of loaded history. Their
masked forms share the pending-approval stack above the composer in Conversation,
Activity and Files. Home and Pages retain Space-wide request access. The metadata
controller holds no supplied values; private fields clear on submission, decline,
backgrounding and unmount, without entering drafts or query caches.

The computer surface shows the current Space's team computer: stopped, starting,
running, stopping, failed with its reason, or not configured on this server.
Start is available when stopped, failures offer retry, and Stop requires
confirmation. Pending commands and lifecycle transitions guard repeated
activation. not-configured is a quiet explicit state without controls. Files
remain bounded read-only computer access rather than local device files.

Computer reads and commands use `computers.get/start/stop`. The model applies
`computer.state` events, reads failure details through `get`, and refreshes on
reconnect; changing Space discards
the previous Space's state. The backend resolves current membership for every
request. No provider credentials or execution port enter either renderer.
The panel shows bounded computer files, tool activity and the optional Screen.
Agent tool approvals render as addressed conversation cards, including active work outside the loaded
history window.

The Screen section uses optional graphical provider capabilities. Web and Desktop
share start/stop, a fitted image, view pause and exclusive control. The existing
authenticated `/events` bridge carries `screen.subscribe`, `screen.ack`,
`screen.unsubscribe` and `screen.event`; no new native credentials or supervisor
endpoint enters the renderer. One frame is outstanding per viewer, with a
ten-second ACK deadline and a 1,500,000-byte envelope limit. Closing a panel,
changing Space/account or losing the session drops pixels and releases its bound
control. A five-minute stream reconnects with a new viewer identity. The control
holder, thirty-second renewable expiry and Agent input wait are visible to viewers.
Tab leaves the focused screen; Escape releases control and focuses Take control.
Expand opens a large dialog with the same view, controls, controller and viewer
stream; it creates no second subscription. While controlling, Escape releases
control and keeps the dialog open. Once view-only, Escape closes it and returns
focus to Expand. The text field supports composed input. Native Mobile has no
Screen view or input; use the phone Web client. Packaged Desktop acceptance
remains a separate gate.

Conversation history and its cursor live together in component memory. Reload
starts from an authoritative snapshot; reconnect resumes the existing projection.
Only the unsent draft and any frozen unconfirmed-send receipt persist on the
device, keyed by server origin, account, Space and conversation. A delivery retry
uses that same key; a failed-Run retry restores the triggering text for an explicit
new Send. Neither restoration sends anything. Streaming text is outside live
regions; a polite status announces reply activity and completion.

## Web

- TanStack Start renders on the server and runs on Bun. It imports no backend,
  auth server or database code.
- Web is the complete client. Every workflow is available in a phone browser.
- Web can be installed as an app. Offline, it shows a retry page and keeps no
  cached data.

## Desktop

- The MyGo host wraps the same Web UI in the system WebView.
- Desktop chooses a server on first run and signs in through the system browser with
  OAuth and PKCE.
- Desktop adds the application menu and the device
  connector. It launches the bundled CLI by absolute path and never imports CLI
  source.
- Granting a Space access to this device asks for native confirmation. The device
  connector keeps running after the window closes, so granted work continues.
- The renderer receives no credentials.
- Native notifications for server Agent Runs are not implemented; approvals remain in the shared workspace.

The daemon bridges `/events` through bounded private open/read/send/close methods
on the existing renderer channel. It fixes the destination and session headers;
the renderer receives validated conversation frames and sends its own ACK after
application. Peer loss, account selection and session replacement close the
remote socket. Browser previews use the ordinary cookie-authenticated WebSocket.

Packaged Desktop carries remote WebSocket termination through the same daemon
channel: `events_read` returns existing conversation/Space frames, null for an
idle poll, or the additive `{ type: "closed", code, reason }` terminal result.
The daemon accepts only well-formed UTF-8 reasons within the 123-byte WebSocket
budget and forwards the public Space/session reason only with its expected code.
Other reasons are empty; unknown codes retain generic client behavior. Closed
streams discard unread content and retain one terminal result until read, peer/
session cleanup or a 20-second expiry, within the eight-stream limit. The renderer
passes its code/reason to the shared conversation socket's `onClose` once and
stops reading. Local teardown suppresses late callbacks. Go remains the finite
bootstrap and native-capability host; cookies and host credentials stay private.
Browser simulation and daemon transport tests cover this boundary separately
from packaged WKWebView/WebView2 acceptance.

## Mobile

- The Expo app shares Core, contracts and message catalogs. It keeps its own
  Expo-supported React version.
- Mobile provides account/sign-in, direct/group conversations, structural mentions,
  Space members/invitations, routines, Agent/shared memory, resource catalogs,
  enablement and account resource availability. Pages use Web handoff with no
  authenticated native document frame. The exact native/read-only/Web split is in
  [Product](../../PRODUCT.md#operating-context). Mobile also supports
  active work outside the loaded history window, tool activity/effects and approvals.
  Push notifications remain roadmap work. OpenAPI management stays in
  Web/Desktop; Mobile can approve and inspect calls to configured operations.
- Team computer lifecycle, bounded read-only files and stop confirmation are native. Screen viewing and
  takeover use the phone Web client; Mobile has no Screen UI or input forwarding.
- Mobile uses native controls for navigation, pickers and alerts.

All three clients show active Runs outside their bounded conversation window in
a Still working strip above the composer. It includes Agent name, Run state,
origin/untrusted markers and addressed pending cards. Stop, approval answers and
steering work without loading old messages. Show Run loads the trigger's page and
removes that Run's duplicate strip entry. Web/Desktop share the DOM implementation;
Mobile uses native controls over the same model.

## Interface rules

- Chat shows the reply, useful progress, results and requests for help. Tool
  lifecycle belongs in the activity view.
- Prefer icons and affordances over explanatory copy. Show advanced capability
  when it becomes relevant.
- Use the existing `@raypx/ui` primitives, the neutral light and dark tokens and
  Tailwind utilities.
- Keep keyboard focus, accessible labels and reduced motion.
- English and Chinese are both first-class. See
  [internationalization](internationalization.md).

## Device settings and selection

Space settings includes Devices for the current member's machines: short-lived
pairing code, connection state, per-Space confirmed directories and revocation.
The existing Computer surface selects a team sandbox or one connected device
directory per conversation/member. It says that execution runs on the machine
without sandbox isolation, preserves unavailable selections and applies changes
to the next Run. Device approval cards show the device, directory and bounded
complete command. English and Chinese share the same controls and warnings.
The redesigned home and conversation composer chips reflect this per-conversation
selection and open the Computer card or sheet. Selecting a device never starts a
team sandbox. The Files tab identifies Team sandbox explicitly because its
Space-scoped read port has no device-directory selector.

Desktop pairs through a native Cancel-default dialog and finite absolute bundled
CLI calls. The connector queues remote directory requests; the native host checks
the current cookie session and configured origin before showing a picker and
confirmation. It rechecks before confirming the one-use token. Grant requests for
other machines route through the backend. Headless devices use explicit interactive
CLI consent; browser confirmation alone grants nothing. The retired instance enrollment and device-owned execution runtime are removed.
See [device setup](../development/device-connector.md).
