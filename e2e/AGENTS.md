# @raypx/e2e

## Purpose

Browser acceptance of the compiled Web and Desktop renderer. Native bridges and
production-origin cookie persistence require separate packaged platform checks.

## Interface

Run bun run test:e2e after installing Chromium with bun --bun playwright install chromium.
The root launcher selects the pinned Node before Turbo modifies PATH. `serve-web.ts`
starts the compiled Web artifact with that absolute executable; Desktop uses Vite
preview. Do not run the Node Web output through Bun's node shim.

## Constraints

No default test script. Do not import application source or seed operator databases.
Use accessible roles and real UI state. Browser preview does not simulate native IPC.
HTTP fixtures isolate signed-out and form response rendering; they do not establish
server authentication correctness. The API PostgreSQL gate exercises real signup,
verification, password reset and session revocation. Theme/locale screenshots are
written under ignored test-results for visual inspection.

## Verification

Run bun run --cwd e2e check; bun run test:e2e is an explicit browser gate.
