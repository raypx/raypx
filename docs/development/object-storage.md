# Session attachment storage

Web and Desktop remote session editors can attach UTF-8 text files when object
storage is configured. Selecting a file uploads it immediately. The editor waits
for the upload before it can send the session. It can remove a selection or save
it in a device-local draft. Desktop's offline session path remains device-local.

## Configure S3

Apply the foundation migrations with `bun run db:migrate` on the deployment's
active database. Create a private AWS S3 or compatible bucket, using a credential
scoped to PUT on `session-attachments/*`. Raypx uses path-style requests, so the
endpoint is the service origin without the bucket. Block public access and
configure expiration after 30 days on that prefix, including noncurrent
versions if versioning is enabled. The policy also collects objects from
interrupted uploads. [S3 Lifecycle expiration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html)

In Web, open **Configuration center** → **Object storage**. Administrators can
set AWS S3 or Cloudflare R2 endpoints, enter both credentials and pause or
resume uploads. Replacing the endpoint, bucket or region requires a new pair of
keys. Leaving both fields empty preserves the stored credentials for the current
location. The page reports the saved configuration state. Actual upload attempts
verify bucket access.

For a custom S3-compatible endpoint, the deployment operator first runs this
command with the API's `DATABASE_URL` and `AUTH_SECRET` available in the
environment. Pass JSON on standard input from the deployment secret manager
or a protected file. Web can manage credentials and settings for that endpoint
after it is configured.

```sh
bun run --cwd apps/api storage:configure < /path/to/protected-storage-config.json
```

```json
{
  "endpoint": "https://s3.eu-central-1.amazonaws.com",
  "region": "eu-central-1",
  "bucket": "raypx-private",
  "accessKeyId": "<access-key-id>",
  "secretAccessKey": "<secret-access-key>"
}
```

`storage_configuration` stores the endpoint, region and bucket along with both
keys sealed together using AES-256-GCM. A domain-separated HKDF key is derived
from the API's `AUTH_SECRET`. Enter both keys in Web or run the command again to
re-seal them after changing `AUTH_SECRET`. Each upload reads the committed
configuration. This command replaces the former `S3_*` API environment settings.
The browser and Desktop daemon use authenticated RPC, so S3 CORS rules and
public URLs are unnecessary.

## Ownership and retention

The API validates the current session, trusted origin and account-owned remote
project. It accepts at most 24,000 bytes and 8,000 UTF-16 code units per file,
and rejects invalid UTF-8, empty text and binary control characters. It stores
the original bytes under a server-generated S3 key. A PostgreSQL projection
holds the validated text for up to 30 days and becomes eligible for session
creation only after the object upload succeeds. An account can have 64 active
uploads. The scheduled cleanup removes expired projections in bounded batches.

A draft stores the attachment ID and name. It resolves only for the same
account, computer and project. Removing the selection leaves the uploaded
object and projection to their expiry policies. The same eight-source and
32,000-character execution budget covers references and attachments together.
On send, Raypx freezes the text in the session's existing context snapshot.
That snapshot is part of session history and follows its retention. The
Relay v5 path delivers this snapshot without giving the relay S3 credentials.
Deploy matching Web, API, Relay and Desktop/CLI versions for remote sessions.
