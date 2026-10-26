# @raypx/logger

Private ESM source workspace for Raypx's shared structured logging. API and CLI
depend on it through `workspace:*`; no package publication or archive is needed.
The implementation retains evlog as an external catalog dependency.

| Entry                    | Responsibility                                          |
| ------------------------ | ------------------------------------------------------- |
| `@raypx/logger`          | Native evlog logger, configuration and error APIs/types |
| `@raypx/logger/context`  | Node/Bun asynchronous logger context                    |
| `@raypx/logger/pipeline` | evlog batching, retry and flushing APIs                 |
| `@raypx/logger/safe`     | Field allowlists, redaction and bounded safe events     |
| `@raypx/logger/managed`  | Bounded delivery, concurrency, statistics and shutdown  |
| `@raypx/logger/stream`   | Ordered JSON lines on stderr or another Node writable   |

Applications configure evlog globally once per process/isolate. Importing the
workspace or creating a managed drain does not initialize logging. API retains
its typed HTTP/RPC/Job events, runtime field policy and PostHog reporter; CLI owns
diagnostic categories. Do not send credentials, bodies, paths or task output.

```ts
import { createLogger, initLogger } from "@raypx/logger";
import { createManagedDrain } from "@raypx/logger/managed";
import { createStreamDrain } from "@raypx/logger/stream";

const drain = createManagedDrain({
  policy: { fields: ["operation", "status", "error"] },
  sink: createStreamDrain(),
});
initLogger({ env: { service: "example" }, silent: true, drain });
createLogger({ operation: "example.completed" }).emit({ status: 200 });
await drain.close();
```

`/safe` and `/managed` have no Node imports and work on Workers. Safe projection
runs before buffering, strips raw drain context and limits events to 16 KiB by
default. Errors retain a name and machine code; messages, stacks and causes are
removed. Shapes retain only explicitly listed string fields.

The managed queue admits at most 1024 queued plus active events by default.
Overflow drops the new event, and failures never retry. Default concurrency one
preserves order; larger concurrency permits completion reordering. Delivery starts
in a microtask and does not wait for the sink in the emitting call.
`stats()` returns pending/delivered/failed/dropped counts and admission state.
`flush()` waits for delivery and reports unreported loss once. Concurrent flushes
share one promise. Call it after producers stop when finite draining is required.
`close()` stops admission immediately, attempts sink cleanup even after flush
failure and shares one result. Its default ten-second deadline bounds waiting;
it cannot cancel arbitrary sink work. Transports own cancellation.

Context helpers bind existing loggers without emitting or configuring them.
Nested scopes restore their parent, and concurrent scopes stay isolated.
The stream drain never ends a caller-owned stream. CLI stdout stays reserved for
command results and the Desktop protocol.

Run `bun run --cwd packages/logger check` and `bun run --cwd packages/logger test`.
Root verification also checks compiled API Node/Worker outputs and the standalone
CLI outside the repository. See [source provenance](NOTICE.md).
