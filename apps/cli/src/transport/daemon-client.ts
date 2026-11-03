import { createLocalClient } from "@raypx/contracts/local-client";
import { localEventSchema, localResponseSchema, type LocalEvent } from "@raypx/contracts/local";
import { connectDaemon, daemonFetch, type ProfileOptions } from "../runtime/daemon/endpoint";
import { daemonEventLines } from "./daemon-stdio";
import { LocalError } from "../runtime/errors";

/** One authenticated IPC event lease plus finite RPCs; disconnect never owns Agent cancellation. */
export async function createDaemonClient(options: ProfileOptions, start = true) {
  const endpoint = await connectDaemon(options, start);
  const id = crypto.randomUUID(),
    controller = new AbortController();
  const response = await daemonFetch(
    endpoint,
    `/events?client=${id}`,
    undefined,
    controller.signal,
  );
  if (!response.ok || !response.body)
    throw new LocalError("HOST_UNAVAILABLE", "Daemon events unavailable");
  const listeners = new Set<(event: LocalEvent) => void>();
  let disconnected = false;
  const reading = (async () => {
    try {
      for await (const line of daemonEventLines(response.body!)) {
        const event = localEventSchema.safeParse(JSON.parse(line));
        if (event.success) for (const listener of listeners) listener(event.data);
      }
    } catch {
      /* Finite RPCs report their own safe errors; watch reconnects by authoritative reads. */
    } finally {
      disconnected = true;
    }
  })();
  const request = createLocalClient(async (method, params) => {
    if (disconnected) throw new LocalError("HOST_UNAVAILABLE", "Daemon disconnected");
    const requestId = crypto.randomUUID();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
    const result = await daemonFetch(
      endpoint,
      `/rpc?client=${id}`,
      { version: 1, id: requestId, method, params },
      signal,
    );
    if (!result.ok) throw new LocalError("HOST_UNAVAILABLE", "Daemon rejected the request");
    const text = await result.text();
    if (Buffer.byteLength(text) > 8 * 1024 * 1024)
      throw new LocalError("TOO_LARGE", "Daemon reply exceeds limit");
    const value = localResponseSchema.parse(JSON.parse(text));
    if (value.id !== requestId)
      throw new LocalError("INVALID_FRAME", "Daemon reply identity changed");
    if ("error" in value) throw new LocalError(value.error.code, value.error.message);
    return value.result;
  });
  return {
    request,
    subscribe: (listener: (event: LocalEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get disconnected() {
      return disconnected;
    },
    async close() {
      controller.abort();
      await reading;
      listeners.clear();
    },
  };
}
