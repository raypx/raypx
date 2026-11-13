# Clients

Web, Desktop and Mobile show the same Agents and the same state through shared
contracts. A workflow works on every client or degrades for a stated reason.

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
the applied cursor and injected read, command, stream and draft ports.
`@raypx/agents/client` adapts them to React for `/agents`, the signed-in home in
Web and Desktop. Project/session pages, Waiting, New session and guest task drafts
are removed, together with dependent Automations and Desktop project tools.
Account/security, administration/configuration, authentication, public Web pages,
device preferences and the standalone earlier Memory library remain. That Memory
is device/account-owned; phase 1 replies do not recall it.
The Space picker appears after a second Space exists; a labelled New Space action
is always available. Agent forms use the backend's offered model names and show
an explicit unavailable state when that catalog is empty.

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

## Mobile

- The Expo app shares Core, contracts and message catalogs. It keeps its own
  Expo-supported React version.
- Mobile covers conversations, approvals, routines and notifications first. A
  workflow that is not available says so.
- Mobile uses native controls for navigation, pickers and alerts.

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
