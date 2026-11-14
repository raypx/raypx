# Agent and Space memory

PostgreSQL owns Agent and Space memory. Current membership gates every read and
write; immutable document revisions support restore. Resource availability does
not grant Space access. Memory supplies context and never permission.

The API composes `@raypx/memory/space-server` with its PostgreSQL repository.
Feature models/clients render revisions and mutations; the backend runner injects
bounded memory tools. No local device library, context snapshot, attachment
receipt or account-level memory RPC remains. There is no history import.

See [capabilities](../architecture/capabilities.md) and run the workspace's source
and `test:postgres` suites with an explicit disposable database.
