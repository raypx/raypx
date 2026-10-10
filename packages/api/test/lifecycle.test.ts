import { createLogger, withLogContext, type LogRecord } from "@raypx/logger";
import { expect, test, vi } from "vite-plus/test";
import {
  withHttpRequest,
  getRequestContext,
  type RequestContext,
  type RequestLifecycleEvent,
} from "../src/http.js";

const logger = createLogger({ level: "silent" });
const bytes = new TextEncoder().encode("chunk");
const request = (signal?: AbortSignal, id = "stream-request", method = "GET") =>
  new Request("http://localhost/stream?token=private", {
    method,
    signal,
    headers: { "x-request-id": id },
  });
const terminal = (events: RequestLifecycleEvent[]) =>
  events.filter((event) => event.phase === "response-finished");

test("keeps response-ready observation compatible and pulls only with downstream demand", async () => {
  const events: RequestLifecycleEvent[] = [];
  const observe = vi.fn<() => void>();
  let pulls = 0;
  const response = await withHttpRequest(
    request(),
    () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              if (pulls++ === 0) controller.enqueue(bytes);
              else controller.close();
            },
          },
          { highWaterMark: 0 },
        ),
      ),
    {
      logger,
      observe,
      observeLifecycle: (event) => {
        events.push(event);
      },
    },
  );
  expect(pulls).toBe(0);
  expect(observe).toHaveBeenCalledOnce();
  expect(events).toEqual([expect.objectContaining({ phase: "response-ready", status: 200 })]);
  const reader = response.body!.getReader();
  expect(await reader.read()).toEqual({ done: false, value: bytes });
  expect(pulls).toBe(1);
  expect(terminal(events)).toHaveLength(0);
  expect(await reader.read()).toMatchObject({ done: true });
  expect(pulls).toBe(2);
  expect(terminal(events)).toEqual([expect.objectContaining({ outcome: "complete", status: 200 })]);
  expect(terminal(events)[0]!.durationMs).toBeGreaterThanOrEqual(events[0]!.durationMs);
  expect(observe).toHaveBeenCalledOnce();
});

test.each([new Response(null, { status: 204 }), new Response(null, { status: 304 })])(
  "finishes bodyless status $status immediately",
  async (response) => {
    const events: RequestLifecycleEvent[] = [];
    await withHttpRequest(request(), () => response, {
      logger,
      observeLifecycle: (event) => {
        events.push(event);
      },
    });
    expect(events.map((event) => event.phase)).toEqual(["response-ready", "response-finished"]);
    expect(terminal(events)[0]).toMatchObject({ outcome: "complete", status: response.status });
  },
);

test("HEAD does not pull a body that its transport will omit", async () => {
  const pull = vi.fn<() => void>();
  const events: RequestLifecycleEvent[] = [];
  await withHttpRequest(
    request(undefined, "head", "HEAD"),
    () => new Response(new ReadableStream({ pull }, { highWaterMark: 0 })),
    {
      logger,
      observeLifecycle: (event) => {
        events.push(event);
      },
    },
  );
  expect(pull).not.toHaveBeenCalled();
  expect(terminal(events)).toEqual([expect.objectContaining({ outcome: "complete" })]);
});

test("a late stream failure keeps its committed status and finishes once", async () => {
  const records: LogRecord[] = [];
  const events: RequestLifecycleEvent[] = [];
  const failure = new Error("private-stream-failure");
  let pulls = 0;
  const controller = new AbortController();
  const response = await withHttpRequest(
    request(controller.signal),
    () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(stream) {
              if (pulls++ === 0) stream.enqueue(bytes);
              else stream.error(failure);
            },
          },
          { highWaterMark: 0 },
        ),
      ),
    {
      logger: createLogger({ sink: (record) => records.push(record) }),
      observeLifecycle: (event) => {
        events.push(event);
      },
    },
  );
  const reader = response.body!.getReader();
  await reader.read();
  await expect(reader.read()).rejects.toBe(failure);
  controller.abort();
  expect(response.status).toBe(200);
  expect(terminal(events)).toEqual([expect.objectContaining({ outcome: "error", status: 200 })]);
  expect(records.filter((record) => record.message === "Response stream failed")).toHaveLength(1);
});

test("consumer cancellation aborts upstream IO and releases the source once", async () => {
  let context!: RequestContext;
  const cancel = vi.fn<(reason?: unknown) => void>();
  const events: RequestLifecycleEvent[] = [];
  const response = await withHttpRequest(
    request(),
    (current) => {
      context = current;
      return new Response(new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 }));
    },
    {
      logger,
      observeLifecycle: (event) => {
        events.push(event);
      },
    },
  );
  await response.body!.cancel("consumer-stop");
  expect(context.signal.aborted).toBe(true);
  expect(cancel).toHaveBeenCalledExactlyOnceWith("consumer-stop");
  expect(terminal(events)).toEqual([
    expect.objectContaining({ outcome: "cancelled", status: 200 }),
  ]);
});

test.each(["connection", "caller"])(
  "%s abort interrupts a pending response read without becoming 500",
  async (source) => {
    const controller = new AbortController();
    const cancel = vi.fn<(reason?: unknown) => void>();
    const events: RequestLifecycleEvent[] = [];
    const records: LogRecord[] = [];
    const response = await withHttpRequest(
      request(source === "connection" ? controller.signal : undefined),
      () => new Response(new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 })),
      {
        logger: createLogger({ sink: (record) => records.push(record) }),
        signal: source === "caller" ? controller.signal : undefined,
        observeLifecycle: (event) => {
          events.push(event);
        },
      },
    );
    const reading = response.body!.getReader().read();
    const assertion = (async () => {
      await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    })();
    controller.abort();
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(terminal(events)).toEqual([
      expect.objectContaining({ outcome: "cancelled", status: 200 }),
    ]);
    expect(records.some((record) => record.level === "error")).toBe(false);
  },
);

test("signals remain available and linked after response-ready without a lifecycle observer", async () => {
  const caller = new AbortController();
  let context!: RequestContext;
  await withHttpRequest(
    request(),
    (current) => {
      context = current;
      return new Response("ok");
    },
    { logger, signal: caller.signal },
  );
  expect(context.signal.aborted).toBe(false);
  caller.abort();
  expect(context.signal.aborted).toBe(true);
});

test.each(["connection", "caller"])(
  "nested boundaries preserve %s cancellation before headers and record one terminal",
  async (source) => {
    const controller = new AbortController();
    const incoming = request(source === "connection" ? controller.signal : undefined);
    const events: RequestLifecycleEvent[] = [];
    const observe = vi.fn<() => void>();
    const records: LogRecord[] = [];
    const pending = withHttpRequest(
      incoming,
      () =>
        withHttpRequest(
          incoming,
          async (context) => {
            await new Promise<void>((_, reject) =>
              context.signal.addEventListener("abort", () => reject(context.signal.reason), {
                once: true,
              }),
            );
            return new Response("unreachable");
          },
          { signal: source === "caller" ? controller.signal : undefined },
        ),
      {
        logger: createLogger({ sink: (record) => records.push(record) }),
        observe,
        observeLifecycle: (event) => {
          events.push(event);
        },
      },
    );
    const assertion = (async () => {
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    })();
    controller.abort();
    await assertion;
    expect(events).toEqual([
      expect.objectContaining({ phase: "response-finished", outcome: "cancelled", status: null }),
    ]);
    expect(observe).not.toHaveBeenCalled();
    expect(records.some((record) => record.level === "error")).toBe(false);
  },
);

test("an AbortError without a cancelled known signal remains an unexpected error", async () => {
  const events: RequestLifecycleEvent[] = [];
  const response = await withHttpRequest(
    request(),
    () => {
      throw new DOMException("unexpected", "AbortError");
    },
    {
      logger,
      observeLifecycle: (event) => {
        events.push(event);
      },
    },
  );
  expect(response.status).toBe(500);
  await response.text();
  expect(terminal(events)).toEqual([expect.objectContaining({ status: 500, outcome: "complete" })]);
});

test.each([new Error("caller-custom-reason"), "caller-string-reason"])(
  "preserves a nested caller's original custom reason %s while exposing AbortError cancellation",
  async (reason) => {
    const caller = new AbortController();
    const incoming = request();
    const records: LogRecord[] = [];
    const events: RequestLifecycleEvent[] = [];
    const pending = withHttpRequest(
      incoming,
      () =>
        withHttpRequest(
          incoming,
          async () => {
            await new Promise<void>((_, reject) =>
              caller.signal.addEventListener("abort", () => reject(caller.signal.reason), {
                once: true,
              }),
            );
            return new Response();
          },
          { signal: caller.signal },
        ),
      {
        logger: createLogger({ sink: (record) => records.push(record) }),
        observeLifecycle: (event) => {
          events.push(event);
        },
      },
    );
    const assertion = (async () => {
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    })();
    caller.abort(reason);
    await assertion;
    expect(terminal(events)).toEqual([
      expect.objectContaining({ outcome: "cancelled", status: null }),
    ]);
    expect(records.some((record) => record.level === "error")).toBe(false);
  },
);

test("an independent Error with the same message as a caller reason is still logged as unexpected", async () => {
  const caller = new AbortController();
  const reason = new Error("shared-message");
  const independent = new Error("shared-message");
  const incoming = request();
  const records: LogRecord[] = [];
  let nestedStatus: number | undefined;
  const pending = withHttpRequest(
    incoming,
    async () => {
      const nested = await withHttpRequest(
        incoming,
        async () => {
          await new Promise<void>((_, reject) =>
            caller.signal.addEventListener("abort", () => reject(independent), { once: true }),
          );
          return new Response();
        },
        { signal: caller.signal },
      );
      nestedStatus = nested.status;
      return nested;
    },
    {
      logger: createLogger({ sink: (record) => records.push(record) }),
      observeLifecycle: () => undefined,
    },
  );
  const assertion = (async () => {
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  })();
  caller.abort(reason);
  await assertion;
  expect(nestedStatus).toBe(500);
  expect(records.filter((record) => record.message === "Unhandled request error")).toHaveLength(1);
});

test("source pull/cancel and logs retain the captured request even when consumed inside another request", async () => {
  const records: LogRecord[] = [];
  const log = createLogger({ sink: (record) => records.push(record) });
  const observed: string[] = [];
  const response = await withLogContext({ tenant: "A" }, () =>
    withHttpRequest(
      request(undefined, "request-A"),
      () =>
        new Response(
          new ReadableStream<Uint8Array>(
            {
              pull(controller) {
                observed.push(getRequestContext()!.requestId);
                log.info("source pull");
                controller.enqueue(bytes);
              },
              cancel() {
                observed.push(getRequestContext()!.requestId);
                log.info("source cancel");
              },
            },
            { highWaterMark: 0 },
          ),
        ),
      { logger: log, observeLifecycle: () => undefined },
    ),
  );
  await withLogContext({ tenant: "B" }, () =>
    withHttpRequest(
      request(undefined, "request-B"),
      async () => {
        const reader = response.body!.getReader();
        await reader.read();
        await reader.cancel();
        expect(getRequestContext()?.requestId).toBe("request-B");
        return new Response();
      },
      { logger: log },
    ),
  );
  expect(observed).toEqual(["request-A", "request-A"]);
  expect(records.filter((record) => record.message.startsWith("source "))).toEqual([
    expect.objectContaining({ requestId: "request-A", tenant: "A" }),
    expect.objectContaining({ requestId: "request-A", tenant: "A" }),
  ]);
  expect(getRequestContext()).toBeUndefined();
});

test("nested route labels freeze at response-ready and observer failures cannot break the body", async () => {
  const incoming = request();
  let context!: RequestContext;
  const events: RequestLifecycleEvent[] = [];
  const response = await withHttpRequest(
    incoming,
    () =>
      withHttpRequest(
        incoming,
        (current) => {
          context = current;
          return new Response("ok");
        },
        { route: "/static/$id" },
      ),
    {
      logger,
      observeLifecycle: (event) => {
        events.push(event);
        if (event.phase === "response-ready") throw new Error("observer");
        return Promise.reject(new Error("async observer"));
      },
    },
  );
  context.route = "/changed-later";
  expect(await response.text()).toBe("ok");
  expect(events.map((event) => event.route)).toEqual(["/static/$id", "/static/$id"]);
  await Promise.resolve();
});
