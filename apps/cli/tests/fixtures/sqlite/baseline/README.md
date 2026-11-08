# Synthetic migration baseline

`profile.sqlite` is synthetic, generated with Bun 1.4.4 from the schema at
`159b4bc5` before the Bun migration. Its three original Drizzle journal rows
remain intact. It contains a project, finished task, revision, stream ID and
explicitly fake instance key. It contains no user data or usable credentials.

The integration test copies the fixture, opens it with bun:sqlite and the current
Drizzle adapter, and compares its data and journal before/after initialization.
