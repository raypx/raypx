# Desktop native cloud oRPC

The Go host's `API.RPC` calls account/get and hosts/authorize/revoke through the
same native HTTP adapter as renderer API requests. Business payloads stay opaque
JSON; TypeScript contracts remain authoritative.

The adapter enforces configured origin, allowlisted paths/headers, Origin:
views://main, request/response limits, deadlines, cancellation, redirect refusal
and atomic encrypted Cookie batches. Host credentials never enter renderer replies.
The renderer cannot invoke hosts/authorize/revoke through native HTTP.

Requests use the oRPC JSON envelope. Current contracts represent dates as strings;
nonempty serialization metadata, blobs and maps are rejected. HTTP 401 maps to
AUTH_REQUIRED; recognized NOT_FOUND/FORBIDDEN/BAD_REQUEST errors preserve only
their fixed code. Server messages/data are not forwarded. A plain/malformed 404
maps to MISSING_PROCEDURE and authorization fails. The current hosts API is required;
there is no browser-grant fallback.
Redirects cannot become successful authorization responses.

Run `bun run --cwd apps/desktop mygo:test`. The Go tests launch the actual oRPC 2
TypeScript router in tests/native/fixtures/orpc-server.ts with the pinned Bun,
on an ephemeral loopback port. They verify Cookie continuity, native credentials,
account/authorize/revoke calls, status-less errors, missing procedures, redirect
refusal and unsupported metadata. No GUI, database or provider login is needed.
Loopback protocol checks do not establish production HTTPS persistence acceptance.
