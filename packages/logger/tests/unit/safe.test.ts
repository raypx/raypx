import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createLogger, initLogger } from "../../src/index.js";
import { createEventPolicy, safeError, withEventPolicy, type SafeEvent } from "../../src/safe.js";

afterEach(() => {
  initLogger({ enabled: false });
});

function capture(fields: readonly string[], extra: { shapes?: Record<string, string[]> } = {}) {
  const events: SafeEvent[] = [];
  const drain = withEventPolicy(
    ({ event }) => {
      events.push(event);
    },
    { fields, ...extra },
  );
  initLogger({
    env: { service: "test", environment: "test" },
    silent: true,
    pretty: false,
    drain,
  });
  return { events, drain };
}

describe("event policy", () => {
  it("keeps the envelope and allowed fields only", () => {
    const { events } = capture(["operation", "status"]);
    createLogger({ operation: "sync", status: 200, extra: "dropped", requestId: "dropped" }).emit();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ service: "test", environment: "test", level: "info" });
    expect(events[0]).toMatchObject({ operation: "sync", status: 200 });
    expect(Object.keys(events[0]!)).not.toContain("extra");
    expect(Object.keys(events[0]!)).not.toContain("requestId");
  });

  it("removes credentials, messages, causes and stacks from evlog events and framework drains", async () => {
    const { events, drain } = capture(
      ["operation", "metadata", "authorization", "url", "headers", "error", "rpc", "requestId"],
      { shapes: { rpc: ["system", "method", "input"] } },
    );
    const raw = new Error("message-private https://example.com/?token=url-private");
    Object.assign(raw, { code: "FAILED", cause: new Error("cause-private"), secret: "s-private" });
    const metadata = {
      password: "password-private",
      nested: { apiKey: "api-private" },
      label: "https://example.com/?token=url-private",
      note: "Bearer bearer-private and someone@example.com",
    };
    const logger = createLogger({
      operation: "test",
      authorization: "Bearer auth-private",
      metadata,
      body: "body-private",
    });
    logger.error(raw);
    logger.emit();
    await drain({
      event: {
        timestamp: new Date().toISOString(),
        level: "error",
        service: "test",
        environment: "test",
        requestId: "req1",
        headers: { cookie: "cookie-private" },
        error: raw,
        rpc: { system: "orpc", method: "account.get", input: "input-private" },
        url: "https://api.example.com?token=token-private",
        message: "message-private",
      },
      headers: { authorization: "header-private" },
    } as never);
    expect(events[0]).toMatchObject({ level: "error", error: { name: "Error" } });
    expect(events[1]).toMatchObject({
      requestId: "req1",
      rpc: { system: "orpc", method: "account.get" },
      error: { name: "Error", code: "FAILED" },
    });
    const output = JSON.stringify(events);
    expect(output).not.toContain("-private");
    expect(output).not.toContain("example.com");
    expect(output).not.toContain("stack");
    expect(metadata.password).toBe("password-private");
  });

  it("never runs getters or toJSON and bounds cycles and hostile proxies", () => {
    const project = createEventPolicy({ fields: ["metadata", "error"] });
    const getter = vi.fn(() => {
      throw new Error("getter-private");
    });
    const metadata: Record<string, unknown> = { toJSON: getter };
    Object.defineProperty(metadata, "safe", { enumerable: true, get: getter });
    metadata.self = metadata;
    expect(project({ metadata })).toMatchObject({ metadata: { self: "[CIRCULAR]" } });
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("keys-private");
        },
        getOwnPropertyDescriptor() {
          throw new Error("descriptor-private");
        },
      },
    );
    expect(project({ metadata: hostile, error: hostile })).toMatchObject({
      metadata: "[UNAVAILABLE]",
      error: { name: "Error" },
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it("bounds one event's size and keeps earlier allowed fields", () => {
    const fields = ["elapsedMs", ...Array.from({ length: 100 }, (_, index) => `field${index}`)];
    const project = createEventPolicy({ fields });
    const large = Object.fromEntries(fields.slice(1).map((key) => [key, "中".repeat(10_000)]));
    const event = project({ ...large, elapsedMs: 42 });
    expect(event).toMatchObject({ elapsedMs: 42 });
    expect(new TextEncoder().encode(JSON.stringify(event)).byteLength).toBeLessThanOrEqual(16_384);
    expect(JSON.stringify(event)).not.toContain("中".repeat(257));
  });

  it("drops an event whose context cannot be read instead of throwing", () => {
    const sink = vi.fn();
    const drain = withEventPolicy(sink, { fields: [] });
    const getter = vi.fn(() => {
      throw new Error("private");
    });
    expect(() => drain(Object.defineProperty({}, "event", { get: getter }) as never)).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith({ event: expect.objectContaining({ level: "info" }) });
  });

  it("reduces errors to a standard name and machine code", () => {
    expect(safeError(Object.assign(new TypeError("private"), { code: "E_BAD" }))).toEqual({
      name: "TypeError",
      code: "E_BAD",
    });
    expect(safeError({ name: "CustomPrivate", code: "lower-case" })).toEqual({ name: "Error" });
  });
});
