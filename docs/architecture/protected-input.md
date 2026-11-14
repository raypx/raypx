# Protected input

An Agent requests a named value for one operation using metadata only. The
initiating current member supplies the value in a separate masked form after the
ordinary tool approval. Input grants no permission or Allow rule. Auto never
supplies input or reviews a protected operation; exact Allow, Block and account
modes still independently govern the tool.

| Destination    | Delivery                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `environment`  | One named environment variable on one sandbox or own-device command                                                        |
| `stdin`        | UTF-8 standard input followed by EOF on one sandbox or own-device command                                                  |
| `http-bearer`  | Authorization bearer credential for one registered OpenAPI call                                                            |
| `http-api-key` | One named header or query parameter for one registered OpenAPI call                                                        |
| `http-basic`   | Masked username and password for one registered OpenAPI call                                                               |
| `mcp-header`   | One header value for one remote tool invocation, only when the server definition declares that exact `perCallSecretHeader` |

HTTP overrides replace the stored credential for that call and never update it.
The API key query is injected after schema validation and origin/path admission;
it never enters model arguments or endpoint metadata. Routing, framing, cookie
and protocol-control headers are refused. Basic fields travel in the encrypted
answer as `username:password`; the username cannot contain a colon. The combined
input is at most 4096 characters. Header credentials reject CR/LF/NUL. MCP's
header declaration is public configuration, frozen in its catalog and fingerprint;
changing it invalidates the pin. The value is call-local, including that call's
HTTP initialization/session requests to the same server, and absent from discovery,
subsequent invocations and the active stored-credential catalog.

`protectedInputs.pending/answer` are session-authorized, Space-scoped procedures.
Only the initiating member can read or answer the request, after fresh membership
admission. Answers require a trusted mutation Origin and a separate quota. Another
member, including a Space owner or deployment administrator, gains no authority.
Untrusted Runs can request input; the form displays their untrusted status and
source kind. Metadata and model-supplied purposes remain plain quoted text.

## Persistence and recovery

`protected_input_requests` binds the addressed member, Space, Conversation, Run,
tool-call ID, exact tool name and canonical argument hash. Composite foreign keys
bind the historical Run actor. One call has one request. Changed arguments cannot
reuse it. PostgreSQL owns pending, answered, declined, expired, consumed and
cancelled states. The opaque request ID is public metadata; no secret-store
envelope is public. No conversation event variant is added. Ordinary `run.state`
events mark the durable waiting/running transition; clients refresh addressed
metadata independently of the loaded history window.

The default expiry is ten minutes, including time spent answered. Answers use the
existing application-key envelope encryption, with the Space, Run, request, actor
and call hash in the authenticated binding. Construction performs no I/O. Polling,
pending reads, answers and consumption enforce expiry; worker recovery scans also
erase expired envelopes in bounded batches. Stop, terminal Run completion and
member cancellation erase pending and answered envelopes transactionally. Space
and Run deletion cascade the metadata. Ciphertext, wrapped key and key selector
are all removed together; historical state contains no value or value digest.

A waiting tool keeps its canonical pending call in the existing checkpoint and
releases no additional authority. Shutdown retains the request. A replacement
executor reuses it, including an answer supplied while no executor is running.
Consumption validates the current execution lease/fence and commits envelope
deletion before external dispatch. It decrypts only into the consuming operation's
process-local closure. A crash after consumption cannot consume it again. The
effect intent/outcome protocol preserves uncertainty and never retries an unknown
operation. A newly requested operation needs a new member-supplied value.

## Delivery and disclosure boundary

The value never joins prepared arguments, approval arguments, tool catalogs,
conversation messages/events, checkpoints, activity, effects, diagnostics or model
history. Command stdout and stderr are accumulated within the existing combined
byte budget and scrubbed before serialization, including exact echoes split
across output chunks. A final guard handles exact raw and nested JSON-escaped echoes. Before output
truncation, HTTP/MCP adapters scrub the supplied value; ordinary stored-credential
echo refusal remains in place. Provider errors become safe codes. Basic scrubbing
covers the combined credential and each individual field.

Web and Desktop share a dedicated uncontrolled password form. Native Mobile uses
a secure text field and a private ref. The shared controller holds metadata only.
Values clear on submit, decline, unmount, page handoff and backgrounding; uncertain
submissions require refreshing authoritative state. They never enter drafts,
storage, query caches or clipboard controls. English and Chinese labels include
the destination, expiry, privacy disclosure and untrusted provenance.

Scrubbing also covers common UTF-8 base64/base64url (padded and unpadded),
lower/uppercase hex, percent encoding and form URL encoding, plus up to five JSON
escaping layers. This is best effort, not information-flow isolation. Arbitrary
transformations, partial values, line-wrapped encodings, other character sets and
deliberate external disclosure cannot be inferred. An authorized command retains
its OS permissions; an HTTP/MCP server necessarily receives the credential and can
persist or disclose it. Normal approval and destination review remain necessary.

## Device delivery and protocol

Device connector protocol **2** rejects version 1 on pairing/connection and in
stored credentials; there is no fallback or data import. A fresh private connector
profile and pairing are required for the new protocol. The Run's current member
must own the device and native-confirmed Space directory. Existing grant, member,
Run, root requester and connection fences are checked independently of input.
Device commands still require a member answer or exact executable Allow even in
Never ask; Auto never approves them. Device initialization still refuses untrusted
initial Run context; protected input adds no exception.

The private execute frame carries a separate ephemeral `protectedInput` value.
Its destination metadata, but never its value or a value digest, joins the
canonical receipt identity. Ordinary environment/stdin fields exclude that value.
Neither connector state nor the server operation journal stores the payload.
The connector injects it immediately into the owned child process and scrubs raw,
escaped and common encoded stdout/stderr **before** any outbox/receipt event or
server journal write, retaining a bounded tail across output chunks. Receipts and
ACK/reconnect semantics remain durable; an accepted unknown command never replays.
A retry cannot resupply the consumed value. Private broker routing is transient.
Connector-state writers wait at most one second for a competing local writer;
contention beyond that bound still fails closed.

File-content input remains unavailable because writing it deliberately persists
it. Graphical/keyboard injection remains unavailable because the screen and target
application can retain or disclose it. Generic MCP arguments, reusable values and
browser sign-in injection are unsupported. Only the explicitly declared per-call
MCP header is supported. A sandbox command gains no backend-host execution.

## Acceptance

Source tests cover masking, lifecycle controls, both basic fields clearing, raw,
escaped and common encoded echoes, declared-header binding and protocol refusal. PostgreSQL/API acceptance exercises encryption, binding, authorization,
expiry, decline, Stop, fenced single consumption and executor restart. Its full
tool-loop fixture sweeps events, checkpoints, activity, effects, safe diagnostics
and the next model transcript for raw and common encoded values across the command,
HTTP and MCP destinations. Actual CLI-to-API acceptance additionally sweeps device
state/outbox, server connector journals and the model transcript fixture for both
environment and stdin delivery. Shared browser journeys exercise every supported destination on both renderers with traces, video and automatic screenshots
disabled around input. Opt-in PostgreSQL cases run environment and stdin delivery through a real
private supervisor with `RAYPX_TEST_PROTECTED_DOCKER=1`. Provider conformance also
checks cancellation while a child leaves stdin unread. Results and unrun platform
limits are recorded separately; these tests establish no packaged WebView or
native-device acceptance.
