# Clients

Web and Desktop show the same Agents and state through shared contracts. Mobile
shares Core, contracts and the conversation model. An implemented
workflow works on each client or degrades for a stated reason.

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
and device preferences remain. Earlier device/account Memory code is retained for
its remaining consumers; Agent/Space memory opens from the conversation capability
surface and is a separate PostgreSQL-backed feature.
The sidebar header owns Space selection and its New Space menu. An account without
a Space first gets a New Space action. Navigation
contains Agents, Pages, account controls and administration
for administrators. The primary action creates an Agent; a first-run empty state
offers one clear action to create the first Agent. Search and keyboard shortcuts
target only available destinations. Agent forms use the backend's offered model
names and show an explicit unavailable state when that catalog is empty.

The conversation header has a compact computer-state indicator. It opens a sheet
below 1280px and a side panel beside the conversation at wider widths.
The panel shows the current Space's team computer: stopped, starting, running,
stopping, failed with its reason, or not configured on this server. Start is
available when stopped, failures offer retry, and Stop requires confirmation.
Pending commands and lifecycle transitions disable controls and guard repeated
activation. `not-configured` is a quiet explicit state without controls.

Computer reads and commands use `computers.get/start/stop`. The model applies
`computer.state` events, reads failure details through `get`, and refreshes on
reconnect; changing Space discards
the previous Space's state. The backend resolves current membership for every
request. No provider credentials or execution port enter either renderer.
The panel shows bounded computer files and tool activity. Agent tool approvals
render as addressed conversation cards, including active work outside the loaded
history window.

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
- Desktop adds native notifications, the application menu and the device
  connector. It launches the bundled CLI by absolute path and never imports CLI
  source.
- Granting a Space access to this device asks for native confirmation. The device
  connector keeps running after the window closes, so granted work continues.
- The renderer receives no credentials.

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
- Mobile provides account/sign-in, Agent conversations,
  active work outside the loaded history window, tool activity and approvals.
  Push notifications remain roadmap work. OpenAPI management stays in
  Web/Desktop; Mobile can approve and inspect calls to configured operations.
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
