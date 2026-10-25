import { localRequestSchema } from "@raypx/contracts/local";
import { connectDaemon, daemonFetch, type ProfileOptions } from "../runtime/daemon/endpoint";
import { errorPayload, LocalError } from "../runtime/errors";

/** Transport chunks are not protocol records; only complete bounded lines may mix with RPC. */
export async function* daemonEventLines(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of body) {
    pending += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, newline + 1);
      if (Buffer.byteLength(line) > 8 * 1024 * 1024)
        throw new LocalError("TOO_LARGE", "Daemon event exceeds 8 MiB");
      pending = pending.slice(newline + 1);
      yield line;
    }
    if (Buffer.byteLength(pending) > 8 * 1024 * 1024)
      throw new LocalError("TOO_LARGE", "Daemon event exceeds 8 MiB");
  }
  pending += decoder.decode();
  if (pending) throw new LocalError("INVALID_FRAME", "Daemon ended with an incomplete event");
}

/** Losing this pipe disconnects one Desktop client, never its execution owner. */
export async function serveDaemonStdio(options: ProfileOptions) {
  let endpoint;
  try {
    endpoint = await connectDaemon(options);
  } catch (error) {
    const failure = errorPayload(error);
    await new Promise<void>((resolve) =>
      process.stdout.write(
        JSON.stringify({
          version: 1,
          event: "engine.status",
          data: { status: "error", code: failure.code, message: failure.message },
        }) + "\n",
        () => resolve(),
      ),
    );
    throw error;
  }
  const clientId = crypto.randomUUID();
  const controller = new AbortController(),
    active = new Set<Promise<void>>();
  const output = async (value: string) => {
    await new Promise<void>((resolve, reject) =>
      process.stdout.write(value, (error) => (error ? reject(error) : resolve())),
    );
  };
  const events = await daemonFetch(
    endpoint,
    `/events?client=${clientId}`,
    undefined,
    controller.signal,
  );
  if (!events.ok || !events.body)
    throw new LocalError("HOST_UNAVAILABLE", "Daemon event stream is unavailable");
  let writing = Promise.resolve(),
    queuedBytes = 0;
  const write = (line: string) => {
    const size = Buffer.byteLength(line);
    if (queuedBytes + size > 16 * 1024 * 1024) {
      controller.abort();
      process.stdin.destroy();
      return Promise.reject(new LocalError("TOO_LARGE", "Desktop output queue exceeded 16 MiB"));
    }
    queuedBytes += size;
    writing = writing
      .then(() => output(line))
      .finally(() => {
        queuedBytes -= size;
      });
    return writing;
  };
  const reader = (async () => {
    try {
      for await (const line of daemonEventLines(events.body!)) await write(line);
    } catch {
      /* Report a closed host through the input loop below. */
    } finally {
      if (!controller.signal.aborted)
        process.stdin.destroy(new LocalError("HOST_UNAVAILABLE", "Daemon connection closed"));
    }
  })();
  const stop = () => {
    controller.abort();
    process.stdin.destroy();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.stdout.once("error", stop);
  const dispatch = (line: string) => {
    let id = "invalid";
    try {
      const request = localRequestSchema.parse(JSON.parse(line));
      id = request.id;
      if (active.size >= 64)
        throw new LocalError("TOO_MANY_REQUESTS", "At most 64 local operations can be pending");
      const operation = (async () => {
        try {
          const response = await daemonFetch(
            endpoint,
            `/rpc?client=${clientId}`,
            request,
            controller.signal,
          );
          if (!response.ok)
            throw new LocalError("HOST_UNAVAILABLE", "Daemon rejected the local request");
          const body = await response.text();
          if (Buffer.byteLength(body) > 8 * 1024 * 1024)
            throw new LocalError("TOO_LARGE", "Daemon response exceeds 8 MiB");
          await write(body + "\n");
        } catch (error) {
          if (!controller.signal.aborted)
            await write(
              JSON.stringify({ version: 1, id: request.id, error: errorPayload(error) }) + "\n",
            );
        }
      })();
      active.add(operation);
      void operation.then(
        () => active.delete(operation),
        () => active.delete(operation),
      );
    } catch (error) {
      void write(JSON.stringify({ version: 1, id, error: errorPayload(error) }) + "\n").catch(stop);
    }
  };
  try {
    let remaining = "";
    const decoder = new TextDecoder();
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
    controller.abort();
    await Promise.allSettled(active);
    await reader;
    await writing.catch(() => {});
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    process.stdout.off("error", stop);
  }
}
