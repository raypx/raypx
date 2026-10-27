# @raypx/analytics

Raypx product policies and shared browser analytics preferences. Kit owns the generic
PostHog client; this package owns event names, safe enum properties, copy and consent UI.
Root is platform-neutral for Native preference validation. Browser entries never
read application environment variables. Web/Desktop inject configuration and stores.
Consent starts disabled, is device-local and is not an account preference. No prompts,
task IDs, outputs, answers, filesystem paths, URLs or account profile attributes.
Task mutation decorators report accepted/failed attempts, not final execution status.
Do not depend on auth, tasks or native implementations. SDK loading stays deferred.
Consumers import /client/styles.css to include shared settings in Tailwind scanning.

Tests separate pure policy/ports under `tests/unit/` from consent UI and browser
storage under `tests/component/`; only the latter opts into happy-dom.
