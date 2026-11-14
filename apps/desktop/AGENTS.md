# Desktop

MyGo wraps the shared React workspace. Native Go owns OS capabilities and finite
absolute bundled-CLI bootstrap, never Agent execution or CLI source imports.
Read DESIGN.md and use shared feature clients/UI; keep layout changes coordinated
with other workspace work. Web/Desktop share server-owned state and approvals.

The shared workspace has one collapsible sidebar for New, Search, capabilities,
Agents/groups, Space and Recent, plus account and owner invitation actions. The
unselected /agents home centers its composer; a selected conversation uses the
centered reading column, Conversation/Activity/Files tabs and responsive context
cards. Protected-input forms remain independent of drafts and appear once with
approvals above the composer in every tab. Preserve lifecycle controls, history
anchors, scoped drafts, native title-bar insets and /login#settings access.

Settings is a lazy global dialog using the settings fragment; preserve background
routes, mounted drafts and scroll. Packaged routes use hash history. Agents and
Pages inject the same native device pairing/grant ports. Pages keeps Web handoff
for authenticated previews and never imports cookies into the renderer.

The daemon owns cookies, browser sign-in, HTTP and bounded server-event transport.
Native and renderer channel capabilities are distinct. The renderer has no
administrative router, exec/terminal hooks or credentials. Native consent fixes
the configured origin, verifies current account/Space, picks a directory and
rechecks before consuming a one-use confirmation. Account changes/logout revoke
the connector binding. Window close leaves granted connector work running.

Keep preferences and the lifetime instance lock local. Preserve secure key
storage and memory-only fallback. Session persistence is desktop-session.sqlite,
not an Agent profile. Never inspect/import old profile data. GUI Quit releases UI
capabilities without stopping the connector. Keep external URL/main-page admission.

Bun owns renderer builds; CGO_ENABLED=0 is required for Go. Prepare one immutable
format-2 CLI payload and pass RAYPX_CLI_PAYLOAD; never build implicitly or change
sealed bytes. Check/test and mygo:check/mygo:test are source gates. Prepared
native:smoke and interactive/package/signature acceptance remain separate and
platform-specific. Use private homes and owned processes; no GUI activation in
headless checks. Preserve accessible controls, neutral tokens and bilingual copy.
