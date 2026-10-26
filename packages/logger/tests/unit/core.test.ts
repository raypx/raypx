import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  createError,
  createLogger,
  createRequestLogger,
  initLogger,
  log,
  parseError,
  type DrainContext,
} from "../../src/index.js";
import { createDrainPipeline } from "../../src/pipeline.js";

describe("evlog contracts", () => {
  let events: DrainContext[];

  beforeEach(() => {
    events = [];
    initLogger({
      env: { service: "test-service", environment: "test" },
      silent: true,
      pretty: false,
      redact: false,
      drain: (context) => {
        events.push(context);
      },
    });
  });

  afterEach(() => {
    initLogger({ enabled: false });
  });

  it("accumulates one request event with actionable errors", () => {
    const logger = createRequestLogger({ method: "POST", path: "/sync", requestId: "req-1" });
    logger.set({ job: { id: "sync-1" } });
    logger.set({ job: { processed: 3 } });
    const error = createError({
      message: "Sync failed",
      status: 503,
      why: "Destination unavailable",
      fix: "Retry later",
    });
    logger.error(error);
    const event = logger.emit();

    expect(event).toMatchObject({
      service: "test-service",
      requestId: "req-1",
      method: "POST",
      path: "/sync",
      level: "error",
      job: { id: "sync-1", processed: 3 },
      error: { message: "Sync failed" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toEqual(event);
    expect(parseError(error)).toMatchObject({
      status: 503,
      why: "Destination unavailable",
      fix: "Retry later",
    });
  });

  it("redacts fields before either structured or wide events reach a drain", () => {
    initLogger({
      silent: true,
      pretty: false,
      redact: { paths: ["credentials.password"], builtins: false, replacement: "[hidden]" },
      drain: (context) => {
        events.push(context);
      },
    });
    const input = { credentials: { password: "fixture-secret" }, code: "SYNC_OK" };
    log.info(input);
    createLogger(input).emit();
    expect(events).toHaveLength(2);
    for (const { event } of events) {
      expect(event).toMatchObject({ credentials: { password: "[hidden]" }, code: "SYNC_OK" });
    }
    expect(input.credentials.password).toBe("fixture-secret");
  });

  it("retains failed requests while sampling healthy wide events", () => {
    initLogger({
      silent: true,
      pretty: false,
      redact: false,
      sampling: { rates: { info: 0 }, keep: [{ status: 500 }] },
      drain: (context) => {
        events.push(context);
      },
    });
    expect(createRequestLogger({ path: "/healthy" }).emit({ status: 200 })).toBeNull();
    expect(createRequestLogger({ path: "/failed" }).emit({ status: 503 })).toMatchObject({
      path: "/failed",
      status: 503,
    });
    expect(events).toHaveLength(1);
  });

  it("batches and retries real emitted events, then flushes the remainder", async () => {
    const batches: DrainContext[][] = [];
    let attempts = 0;
    const drain = createDrainPipeline<DrainContext>({
      batch: { size: 10, intervalMs: 60_000 },
      retry: { maxAttempts: 2, backoff: "fixed", initialDelayMs: 1 },
    })(async (batch) => {
      attempts++;
      if (attempts === 1) throw new Error("temporary sink failure");
      batches.push(batch);
    });
    initLogger({ silent: true, pretty: false, redact: false, drain });
    createLogger({ jobId: "first" }).emit();
    createLogger({ jobId: "second" }).emit();
    expect(batches).toHaveLength(0);
    await drain.flush();
    expect(attempts).toBe(2);
    expect(batches.flat().map(({ event }) => event.jobId)).toEqual(["first", "second"]);
    expect(drain.pending).toBe(0);
  });
});
