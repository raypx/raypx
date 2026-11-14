# Native Desktop host

app/ owns framework APIs. desktop/ owns OS capabilities, preferences, secure keys,
instance locking and finite absolute bundled-CLI bootstrap. CGO_ENABLED=0 is
required. Do not forward business methods or administrative tokens through Go.

The CLI daemon owns session cookies, HTTP and server-event transport. Native uses
a separate narrow capability for channel setup, visibility, release, quit and
connector account context. Renderer uses first-frame authentication with bounded
ACKs. Pairing/directory grants run finite device native calls with fixed origin,
current account/Space checks and Cancel-default local confirmation. No renderer
path or polling token may authorize a grant. Heartbeats poll pending requests;
recheck before picker, dialog and confirmation. Logout invalidates authorization.

Keep secure-key scope and session recovery isolated to Desktop sessions. Preserve
private permissions, atomic preferences and desktop-instance.sqlite lifetime lock.
GUI Quit releases capabilities and leaves the independent connector running.
Do not read or mutate a real user's credentials in tests. Source-adjacent tests
and tests/native/host cover finite processes, IPC and cancellation. Explicit
compiled CLI and native_smoke compilation are separate from packaged WebView/OS
secret acceptance. No retired terminal, task notification or Host vault exists.
