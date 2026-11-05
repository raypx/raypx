# Object storage

`@raypx/storage` stores files for server code. It wraps [unstorage](https://unstorage.unjs.io)
drivers behind a small `ObjectStorage` interface and adds S3 pre-signed URLs with
aws4fetch. The S3 adapter uses fetch only, so AWS S3 and compatible providers work through the Node API.

## Configuration

The API reads five optional variables. Set endpoint, bucket and both keys together, or
none of them; a partial set stops startup.

| Variable               | Example                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `S3_ENDPOINT`          | `https://s3.example.com`                                     |
| `S3_REGION`            | `auto` (default) or a provider region such as `eu-central-1` |
| `S3_BUCKET`            | `raypx`                                                      |
| `S3_ACCESS_KEY_ID`     | access key with access to that bucket only                   |
| `S3_SECRET_ACCESS_KEY` | its runtime secret                                           |

Requests are path-style (`<endpoint>/<bucket>/<key>`). Without configuration
`runtime.storage.available` is false and every call fails with `STORAGE_NOT_CONFIGURED`;
startup, liveness and other features are unaffected.

## Using it in the API

```ts
const { storage } = runtime;
const key = `avatars/${session.user.id}/${crypto.randomUUID()}.png`;
await storage.put(key, bytes, { contentType: "image/png" });
const bytes = await storage.get(key); // null when missing

// Direct browser upload, bound to the Content-Type the client must send:
const uploadUrl = await storage.signedUrl(key, {
  method: "PUT",
  expiresIn: 300,
  contentType: "image/png",
});
```

- Keys are `/`-separated segments of letters, digits and `! - _ . * ' ( )`. Build them
  on the server from trusted IDs; never accept a client key without checking ownership.
- `list(prefix)` returns every key under that directory prefix.
- Pre-signed URLs last 1 second to 7 days. Bucket CORS must allow the Web and Desktop
  origins for browser uploads. Memory storage has no signer
  (`STORAGE_SIGNING_UNSUPPORTED`).
- Errors are `StorageError` codes without driver messages, URLs or object content.
- Tests use `createMemoryStorage()` or pass `storage` in `RuntimeProviders`.

No HTTP route exposes storage yet. A feature that adds one owns its authorization,
size and type limits, and any database record of the object.
