# Client SDK

No root export. /api provides the typed current RPC client and injectable fetch.
/events provides the authenticated SSE reader for conversation feeds and the
AcknowledgedStream and StreamCursor helpers for WebSocket delivery. SSE callers
own their applied cursor and retry schedule.

This package is browser/native safe: no filesystem, SQLite, environment or server
imports. Fetch credentials/headers for each request. Never automatically replay
an execution or mutation after an uncertain send. Use current public contracts;
there is no task SDK, Relay protocol or compatibility fallback. Run check/test.

/api also exposes renderer origin recovery: one backoff/readiness schedule per
selected API origin. It gates HTTP and stream reconnect admission, honors retry
headers and never replays failed requests. SSR does not share renderer circuits.
