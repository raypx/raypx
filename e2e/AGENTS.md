# @raypx/e2e

## Purpose

Browser acceptance of the compiled Web and Desktop renderer. Native bridges and
production-origin cookie persistence require separate packaged platform checks.

## Interface

Run bun run test:e2e after installing Chromium with bun --bun playwright install chromium.
The root launcher selects the pinned Node before Turbo modifies PATH. `tests/helpers/serve-web.ts`
starts the compiled Web artifact with that absolute executable; Desktop uses Vite
preview. Do not run the Node Web output through Bun's node shim.
Turbo's loose environment mode passes `NODE_BINARY` from the root launcher to this helper.

## Constraints

No default test script. Do not import application source or seed operator databases.
Use accessible roles and real UI state. Browser preview does not simulate native IPC.
HTTP fixtures isolate signed-out and form response rendering; they do not establish
server authentication correctness. The API PostgreSQL gate exercises real signup,
verification, password reset and session revocation. Theme/locale screenshots are
written under ignored test-results for visual inspection.
Guest Web acceptance asserts no private list/subscription requests before login,
preserves the original page and draft choices through sign-in, and checks restoration
does not send a task. Desktop retains its initial login requirement.

## Verification

Run bun run --cwd e2e check; bun run test:e2e is an explicit browser gate.

The control browser test is an explicit real-backend gate. Set CONTROL_E2E_API_URL
and build both surfaces against its isolated fixture API. The default browser
suite skips this gate when the fixture is absent; it must not be reported as passed.

`e2e:live` uses `playwright.live.config.ts` and the opt-in `live-agents.spec.ts`.
It uses a dedicated test account, a running packaged native beta acceptance instance,
real HTTPS/WebSocket traffic and real Claude/Codex inference. Never use a person's
account. Keep tracing off to avoid recording login request bodies; the default E2E
gate skips this live suite. Close the isolated browser after acceptance.
