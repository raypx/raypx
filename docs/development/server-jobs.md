# Server routines and maintenance

Space routines are durable backend state. Workers claim due slots with database
time, revisions, leases and fences and dispatch the same Agent runner. Manual,
scheduled and inbound-email triggers share Space admission. See
[execution](../architecture/execution.md) and
[capabilities](../architecture/capabilities.md).

Nitro's `maintenance:cleanup` runs every fifteen minutes when `JOBS_ENABLED=true`.
It removes expired sessions, verification and OAuth records and old rate-limit
rows using bounded, row-locked batches and an advisory transaction lock.
Failures roll back and retry on the next schedule. No HTTP task runner is exposed.
There is no account/device scheduler, Relay executor or `schedules:tick` task.

Run API source tests and its serial PostgreSQL mode against an explicit disposable
database. Runtime construction performs no scheduling or recovery I/O.
