import { localRequestSchema } from "@raypx/contracts/local";
import { createRuntime } from "../runtime";
import { createForegroundHost } from "../runtime/foreground";
import { errorPayload, LocalError } from "../runtime/errors";
import { recordDiagnostic, type RecordDiagnostic } from "../diagnostics";

export async function serveStdio(options: {
  dataDir?: string;
  profile?: string;
  recordDiagnostic?: RecordDiagnostic;
}) {
  const writes: string[] = [];
  let buffered = 0,
    writing = false,
    failed = false;
  let closeRuntime: () => Promise<void> = async () => {};
  function output(value: unknown) {
    if (failed) return;
    const line = JSON.stringify(value) + "\n";
    buffered += Buffer.byteLength(line);
    if (buffered > 16 * 1024 * 1024) {
      failed = true;
      recordDiagnostic(options.recordDiagnostic, {
        operation: "stdio.backpressure",
        outcome: "failed",
        bufferedBytes: buffered,
      });
      void closeRuntime();
      process.stdin.destroy();
      return;
    }
    writes.push(line);
    flush();
  }
  function flush() {
    if (writing || writes.length === 0) return;
    writing = true;
    const line = writes.shift()!;
    process.stdout.write(line, () => {
      buffered -= Buffer.byteLength(line);
      writing = false;
      flush();
    });
  }
  const runtime =
    process.platform === "win32"
      ? createForegroundHost({ ...options, emit: output })
      : createRuntime({ ...options, scheduler: true, emit: output });
  closeRuntime = () => runtime.close();
  output({ version: 1, event: "engine.status", data: { status: "ready" } });
  const active = new Set<Promise<void>>();
  const stop = () => {
    process.stdin.destroy();
    void runtime.close();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  let remaining = "";
  const decoder = new TextDecoder();
  const dispatch = (line: string) => {
    let id = "invalid";
    try {
      const request = localRequestSchema.parse(JSON.parse(line));
      id = request.id;
      if (active.size >= 64)
        throw new LocalError("TOO_MANY_REQUESTS", "At most 64 local operations can be pending");
      const operation = runtime.request(request.method, request.params).then(
        (result) => output({ version: 1, id: request.id, result }),
        (error) => output({ version: 1, id: request.id, error: errorPayload(error) }),
      );
      active.add(operation);
      void operation.finally(() => active.delete(operation));
    } catch (error) {
      output({ version: 1, id, error: errorPayload(error) });
    }
  };
  try {
    for await (const chunk of process.stdin) {
      remaining += decoder.decode(chunk, { stream: true });
      if (Buffer.byteLength(remaining) > 8 * 1024 * 1024)
        throw new LocalError("TOO_LARGE", "Protocol request exceeds 8 MiB");
      let newline: number;
      while ((newline = remaining.indexOf("\n")) >= 0) {
        const line = remaining.slice(0, newline);
        remaining = remaining.slice(newline + 1);
        if (line.trim()) dispatch(line);
      }
    }
  } finally {
    await runtime.close();
    await Promise.allSettled(active);
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    if (remaining.trim())
      output({
        version: 1,
        id: "invalid",
        error: { code: "INCOMPLETE_REQUEST", message: "Request must end with a newline" },
      });
  }
}
