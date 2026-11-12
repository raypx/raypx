# @raypx/instances

Own runtime instance registration schemas, injected enrollment use cases and signed identity verification. Runtime instances are separate from remote Host grants and provider configurations. No application, auth, filesystem or database implementation imports. `/server`
and `src/server.ts` / `src/server/**` are node entries, so a browser bundle cannot
reach enrollment use cases. Crypto lives behind its Node-compatible entry. Test enrollment expiry, ownership, replay, proof validation and revocation; run check/test and repository verify.

## Catalog ownership

Own `instances` in `locales/<language>/`, with handwritten language entries
and pure `/messages/en` and `/messages/zh` exports. Support TS literal objects or
JSON nested strings, one format per namespace/language. Bind private translation
hooks through type-only catalog imports; applications supply the shared provider.
