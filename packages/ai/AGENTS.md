# Model transport

The root exports the backend model client, provider factories, stream/context/tool
types and stable errors. API owns model resolution and secrets; Agents consumes
stream types. This package executes no tools and owns no filesystem configuration.
There is no CLI model command or /config export.

Resolve secrets only per request. Keep SDK imports lazy and raw failures, headers,
credentials and bodies private. Use bounded deadlines, cancellation and one
attempt; abandoning a stream aborts its request. Retry-After exposes only a parsed
absolute timestamp. Custom endpoints reject embedded credentials; local HTTP is
loopback-only. Run check/test. Live model acceptance stays opt-in.
