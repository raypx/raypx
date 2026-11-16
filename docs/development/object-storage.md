# Object storage

The API optionally stores new chat attachment bytes in the configured private S3
bucket. PostgreSQL owns attachment metadata, access, partial uploads and existing
inline files. Uploads, downloads and Run delivery use the usual authenticated APIs.
Credentials remain encrypted and write-only. Clients receive bytes through Raypx.

In **Configuration center → Object storage**, set the endpoint, bucket, region
and the two access keys. For Cloudflare R2, use the account's S3 API endpoint,
region `auto`, and a token with object read and write access to the selected private
bucket. The API uses PUT, GET and DELETE. Leave the attachment prefix outside any
bucket expiration rule while conversation history needs it.

Pausing storage sends future uploads to PostgreSQL. Keep the bucket and credentials
available for existing R2 attachments and queued deletions. Rotate credentials in
place. Changing endpoint, bucket or region requires all referenced and queued
objects to have been removed. Keep an object-aware API release deployed while history
contains R2 attachments.

Pages still store their bounded version payloads in PostgreSQL. Computer homes
belong to the supervisor/provider. See
[member attachment behavior](../architecture/member-input-and-notifications.md).
