# Protected input

An Agent can request a named value on one sandbox command or one registered HTTP
operation. The request contains a name, purpose and destination, never a value.
For commands the destination is an explicit environment variable. For HTTP it is
a bearer credential sent only to the registered origin. The member reviews the
tool's ordinary approval first; supplying input grants no permission and creates
no Allow rule. Auto review cannot answer an input request or review a protected
operation. Existing exact Allow, Block and account modes still govern the tool.

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
across output chunks. A final guard handles exact raw and JSON-escaped echoes.
Provider errors become safe codes. HTTP adapters refuse credential echoes and
never retain the one-call override in their active credential catalog.

Web and Desktop share a dedicated uncontrolled password form. Native Mobile uses
a secure text field and a private ref. The shared controller holds metadata only.
Values clear on submit, decline, unmount, page handoff and backgrounding; uncertain
submissions require refreshing authoritative state. They never enter drafts,
storage, query caches or clipboard controls. English and Chinese labels include
the destination, expiry, privacy disclosure and untrusted provenance.

This is exact-value output scrubbing, not general information-flow isolation.
An authorized command can use the value with its OS permissions; transformations,
encoded derivatives and deliberate external disclosure cannot be inferred by the
scrubber. Normal tool approval and the Computer boundary remain necessary.

Conservative unsupported destinations: device commands journal their payloads;
file writes deliberately persist contents; generic MCP arguments have arbitrary
server persistence and echo behavior. These paths do not accept protected input.
Standard input, reusable values, browser sign-in injection and protected graphical
typing are not implemented. A sandbox command receives only its explicit
per-command environment; this adds no backend-host execution.

## Acceptance

Source tests cover masking, lifecycle controls, clearing and exact/escaped echo
scrubbing. PostgreSQL/API acceptance exercises encryption, binding, authorization,
expiry, decline, Stop, fenced single consumption and executor restart. Its full
tool-loop fixture sweeps events, checkpoints, activity, effects, safe diagnostics
and the next model transcript for the generated exact value. Shared browser
journeys exercise both renderers with traces, video and automatic screenshots
disabled around input. An opt-in PostgreSQL case runs the command through a real
private supervisor with `RAYPX_TEST_PROTECTED_DOCKER=1`. Results and unrun platform
limits are recorded separately; these tests establish no packaged WebView or
native-device acceptance.
