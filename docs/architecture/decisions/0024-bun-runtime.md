# ADR-0024: Bun as the repository and production runtime

## Status

Accepted

## Context

Bun already owns installation, repository commands and the Electrobun host.
Web, API and Worker previously required a separate Node executable, version gate
and container runtime. The requested runtime consolidation extends Bun to these
services and the isolated Runner, including builds and verification.

## Decision

Use Bun 1.4.3 for server execution, Worker/Runner execution, repository JavaScript
tools and the existing Vite+/Vitest and Playwright runners. Keep Turbo as the
only task orchestrator and cache. Explicit `bun --bun` tool commands override
Node shebangs; neither a Node installation nor an automatic Node fallback is part
of the repository contract.

The runtime pin was upgraded from 1.4.0 to 1.4.3 on October 14, 2026 without
changing these boundaries. Desktop's native main process remains on Bun 1.4.0
supplied by the pinned Electrobun SDK; its host runtime follows SDK upgrades
independently of the repository and server pin.

Web and API explicitly select Nitro's `bun` preset and run its compiled server
entry with Bun. Worker uses Vite+ and Nitro's custom executable entry and second
Runner input, as defined by ADR-0023. The compiler and task cache remain separate
from the executable runtime; Turbo restores the complete `.output/**` artifact.

Use pinned Bun container binaries with unprivileged users. Worker retains Debian
Bookworm, its dated conversion-tool snapshot and fonts; switching the interpreter
must not switch that operating-system baseline implicitly.

Isolated Runner children and artifact probes disable Bun's automatic `.env`
loading and package installation. The Runner's minimal environment and credential
boundary remain intact. Runtime compatibility tests must exercise actual Bun
processes, compiled Nitro hosts, IPC, document/mail rendering and relocated
artifacts. Node-compatible APIs, type declarations and module-resolution presets
are allowed; they do not require the Node executable.

This supersedes only the Node runtime provisions of ADR-0016, ADR-0018 and
ADR-0020. Their cloud architecture, Turbo ownership and Desktop boundaries remain
in force.

## Consequences

Development tools, tests and production services share one pinned Bun version.
Desktop's native host uses the Bun version supplied by its pinned Electrobun SDK.
Cache fingerprints include the exact Bun runtime and operating-system ABI.
Doctor and CI enforce Bun instead of installing or validating Node.

Bun compatibility is a shipping gate, including DOM tests, production HTTP/auth
probes, isolated Runner lifecycle and actual document converters. A dependency
failure must be repaired or reported, rather than hidden by a second interpreter
or skipped coverage. Historical Node acceptance records remain historical data;
this decision does not claim a universal performance improvement.

## Follow-up

Revisit only if a required runtime capability cannot be supported by the pinned
Bun release. Validate runtime upgrades against the same artifact and security
boundaries before changing the pin.
