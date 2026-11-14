# Member attachments, device files and notifications

These workflows use current sessions and fresh Space membership. PostgreSQL is
both the content authority and the source of notification state. Browser renderer
acceptance, native components and packaged device acceptance remain separate gates.

## Attachments

`messageAttachments.upload/remove/download` are session-only renderer procedures.
Uploads are explicitly initiated from Web/Desktop's composer menu, file drop or
image paste, or Mobile's document/photo picker. Files are limited to four per
message and 1 MiB each. Supported types are PNG, JPEG, GIF, WebP, PDF, UTF-8 plain
text, Markdown, CSV and JSON. Names have at most 120 characters and exclude control,
format and path characters. Signatures, canonical base64, text encoding and JSON
are checked by the backend. Type checks do not claim to scan documents for threats.

Uploads use at most 96 KiB of raw bytes per request, fitting Desktop's existing
private transport envelope. Continuations carry the upload ID, exact byte offset,
total size and final flag. Identical acknowledged-prefix retries do not append
again. Incomplete files cannot be sent or downloaded. Finalization validates the
whole file and records its SHA-256 digest. There are at most 32 live unsent uploads
per member/Space, expiring 24 hours after creation. Worker scans and upload
admission delete expired rows in batches of at most 100. Request admission allows
120 upload/remove calls per minute and 60 downloads per minute per account/path.

`conversation_attachments` stores these bounded bytes as base64 in PostgreSQL.
Same-Space conversation/message foreign keys, finalization checks and transactional
claiming prevent cross-Space or partial publication. Published files survive
unsent cleanup and cascade with their conversation. Only the uploading member can
remove or download their unsent file; every current Space member can download a
published message's files. A removed member loses access immediately.

`conversations.send.message.attachmentIds` claims final uploads in the same
transaction as the member message and Runs. Attachment-only messages are valid.
Retries preserve the original message. Local drafts never store file bytes or
restart uploads; uncertain-send receipts freeze only uploaded identities along
with the existing key. Restoring either never sends anything. Abandoned uploads
expire even when a client disappears without removal.

History, snapshots and hydrated `message.created` events include attachment
metadata. Additive `attachment.state` events record per-Run image, available or
withheld outcomes and update chips before cursor acknowledgement. Download RPC
returns bounded base64 for native transports. The session-checked
`GET /message-attachments/:spaceId/:conversationId/:id` route always sends an
attachment Content-Disposition, UTF-8 encoded safe filename, octet-stream,
no-store, nosniff and a deny-all sandbox CSP. Files are never inline document frames.

## Run delivery

Member-supplied files are untrusted context and never permission. The backend adds
labelled name, type, size, digest and delivery outcome to ephemeral model input.
Images become image parts only when the resolved model advertises image support;
the UI disables image selection otherwise and the backend records a withheld
reason for a changed or unavailable capability. Image bytes are not copied into
Run checkpoints or event payloads.

Other files use the Computer port's write operation at
`inbox/<run-id>/<attachment-id>`. Supplied names never form paths. The existing
Computer gate, execution fence and protected-value guard remain in force. A
selected device needs its initiating member's current local directory grant;
there is no sandbox fallback. Missing/revoked grants, unavailable computers and
uncertain delivery produce explicit withheld chips. Generated inbox parents are
created relative to no-follow directory descriptors inside the granted root.

`conversation_attachment_deliveries` binds each receipt to its exact same-Space
Run and message attachment. A staging receipt commits before an external write.
Recovery reuses completed receipts; a prior staging receipt becomes withheld
with `DELIVERY_UNCONFIRMED` and is never replayed. Context is bounded to 32 files
across a Run's triggering and steering messages; exceeding that bound fails the
Run explicitly. This policy favors visible uncertainty over duplicate writes.

## Device Files

`computers.listDirectory/readFile` add an optional device/grant selector. Omitting
it retains the team sandbox path. The owning member can browse only that current
Space grant through the connector, independently of sandbox lifecycle or a Run.
Another member sees `DEVICE_NOT_OWNED`; revoked grants are unavailable; offline
connections show `DEVICE_OFFLINE` as waiting. Changing selection clears old paths
and invalidates late responses. Web/Desktop and Mobile render these states.

Connector protocol 2 includes `member-read`/`member-read-result` alongside protected
command delivery; older versions are rejected without fallback. These frames permit only bounded
list/read operations: at most 200 entries or 64 KiB, no commands or writes. They
carry member, Space, grant revision, connection fence and an expiring request ID.
`device_member_file_reads` holds transient routing/results for split processes,
with same-Space grant/owner foreign keys, eight outstanding requests per member
and a ten-second expiry. Every dispatch and result checks current membership,
owner, grant, connection and expiry. The connector rechecks local authority and
uses no-follow file descriptors before and after reads. Results are consumed once;
worker cleanup removes expired rows in batches of 100. These requests never
create Runs, tool effects or connector execution journals.

## Notification list

`notifications.list/read/viewed` are additive session-only renderer contracts.
The sidebar bell and Mobile list query pending addressed approvals and protected
input requests, the member's top-level successful/failed Runs from the last 30
days, and their still-open issued invitations across current Spaces. Pending
items sort first; the list is capped at 100 with an explicit truncation flag.
Source queries join active memberships before limiting. Resolving, expiring or
revoking a source removes its pending item without another authority or queue.

Invitations are bearer links without a recipient identity. The list therefore
shows only the current member's issued open links and jumps to invitation
management; it never exposes another person's unaccepted link. Recipient-targeted
invitations require a separate product and schema decision.

`member_notification_reads` stores per-member source read receipts;
`member_conversation_views` stores the last foreground conversation view. Finished
Runs after that view are unread until seen or opened. The visible conversation
updates its view every 15 seconds; a completion may briefly remain unread between
heartbeats. The bell/list refreshes on entry and every 30 seconds while foreground.
Opening an item marks it read and jumps across Spaces to its conversation/Run or
invitation settings. Read/view writes allow 60 requests per minute. No push
provider, OS alert, email delivery or second notification store is configured.
