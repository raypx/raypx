# Server caching

## Runtime configuration

`src/config/reads.ts` registers one typed PostgreSQL loader per scope in each
API runtime. Site, S3 and Resend share the same five-second TTL and coalesce
concurrent misses. Site snapshots are copied for readers. Resend and S3 can
reuse their process-local provider instances. Missing or paused settings can be
cached for the same interval. Read or decryption failures are retried on demand.

| Read method    | Callers                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `read()`       | Administrator settings, authoritative registration, cleanup, and S3 upload admission            |
| `readCached()` | Public site projection, signup pre-check, mail site name, S3 upload status, and Resend delivery |

After a settings transaction commits, the writer clears its local cache for that
scope and broadcasts the scope and revision on a deployment-scoped Redis
channel. Subscribers clear that scope, or clear all scopes after resubscribing.
Any superseded in-flight read reloads before returning. Redis carries only
notifications. PostgreSQL stores settings and encrypted provider credentials.
The TTL covers operator initialization, disconnections and missed notifications.
Already dispatched mail or uploads continue with the provider used at dispatch.
