# MyGo Desktop host

Go composes the React SPA with windows, tray, notifications, dialogs, updater,
device preferences and the stable lifetime SQLite instance lock. Framework APIs
belong in app/; desktop/ owns framework-independent native capabilities. Launch
only the absolute version-matched bundled CLI. CGO_ENABLED=0 is required.

The retained daemon owns session, HTTP/account policy and renderer transport;
new Agent execution and recovery stay in the backend. The current renderer has
no project Terminal or device task pages.
Go runs finite `daemon desktop` bootstrap and holds a separate narrow native
capability for visibility, directory picks, notifications and binding release.
The renderer uses its own first-frame-authenticated loopback WebSocket. Never
forward business methods through Go or expose the administrative daemon token.
Restrict native calls to the owned main page; preserve external URL checks.

MyGo Secrets uses `raypx-desktop-session-v1-` scoped to canonical native directory
and canonical CLI profile directory. Create only when the daemon reports no
stored sessions in the entire profile. An unavailable key permits memory-only
sign-in; keys travel through stdin/private IPC only. Never read, import, modify
or delete the old Go session database or its vault namespace.
Retry bootstrap even while ready, retaining the old client until validation.
Only native-confirmed recovery resets the key and all origins' Desktop sessions;
verify key storage before the session-table transaction. Keep Host vault intact.

Preserve native data paths, the exclusive `desktop-instance.sqlite` lock and
atomic preference writes. Private paths use POSIX permissions or inheritable
Windows DACLs. Interactive GUI Quit checks active Agent tasks through the native
capability. The dialog lets the user keep them running, stop the checked tasks or
cancel quitting. GUI Quit releases UI capabilities.
Its private owner ID also cleans all owned tools/terminals across origins, with
administrative fallback after capability expiry. Rebootstrap/connection release
preserves execution. Request contexts own deadlines; only transport failures
change availability, never business errors, cancellation or timeout.
Desktop injects NativeClient through Options; no Go event queue or business schema.

Source-adjacent tests cover native admission; tests/native/host covers finite
subprocesses, IPC, cancellation, locks and explicit compiled CLI acceptance.
Cookie/API/account/ACK behavior lives in CLI's daemon Desktop suites. Run Go
checks through repository verification; native_smoke must compile too. Headless
checks never activate a GUI or read production credentials. Packaged WKWebView/
WebView2 Origin, mixed-content and OS-secret acceptance remain platform gates.
