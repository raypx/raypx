# Object storage

The API retains operator-configured object-storage settings, connection testing
without an active object writer. Credentials stay encrypted and
write-only. The retired session-attachment upload route and receipt tables are
removed; there is no current product attachment writer using that former path.

Pages store their bounded version payloads in PostgreSQL. Computer homes belong
to the supervisor/provider and are not an object-storage attachment namespace.
See [Spaces](../architecture/spaces.md) for deletion and resource ownership.
