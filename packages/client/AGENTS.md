# Client SDK

No root export. /api provides the typed current RPC client and injectable fetch.
/events provides AcknowledgedStream and StreamCursor for API event delivery.
Exact ACKs advance cursors; deadlines, aborts and resets cancel pending delivery.

This package is browser/native safe: no filesystem, SQLite, environment or server
imports. Fetch credentials/headers for each request. Never automatically replay
an execution or mutation after an uncertain send. Use current public contracts;
there is no task SDK, Relay protocol or compatibility fallback. Run check/test.
