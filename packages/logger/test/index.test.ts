import { afterEach, expect, test } from "vite-plus/test";
import { configureLogging, createLogger, withLogContext, type LogRecord } from "../src/index.js";

afterEach(() => configureLogging({ environment: "test" }));

test("accepts both existing call styles and enforces log levels", () => {
  const records: LogRecord[] = [];
  const log = createLogger({ name: "api", level: "info", sink: (record) => records.push(record) });
  log.debug("hidden");
  log.info("created", { id: "1" });
  log.error({ id: "2" }, "failed");
  expect(records.map((record) => [record.level, record.message, record.id])).toEqual([
    ["info", "created", "1"],
    ["error", "failed", "2"],
  ]);
});

test("redacts nested credentials, headers, connection URLs and error causes", () => {
  const records: LogRecord[] = [];
  const log = createLogger({ sink: (record) => records.push(record) });
  log.error("failed", {
    nested: { sessionSecret: "secret-sentinel" },
    headers: new Headers({
      authorization: "Bearer header-sentinel",
      cookie: "session=cookie-sentinel",
    }),
    error: new Error("redis://user:password-sentinel@localhost", {
      cause: new Error("token=cause-sentinel"),
    }),
  });
  const output = JSON.stringify(records);
  for (const secret of [
    "secret-sentinel",
    "header-sentinel",
    "cookie-sentinel",
    "password-sentinel",
    "cause-sentinel",
  ])
    expect(output).not.toContain(secret);
  expect(output).toContain("[REDACTED]");
  expect(output).toContain("stack");
  expect(output).toContain("cause");
});

test("isolates asynchronous correlation contexts including infrastructure loggers", async () => {
  const records: LogRecord[] = [];
  const log = createLogger({ sink: (record) => records.push(record) });
  await Promise.all(
    ["first", "second"].map((requestId) =>
      withLogContext({ requestId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, requestId === "first" ? 5 : 0));
        log.info(requestId);
      }),
    ),
  );
  expect(records.every((record) => record.requestId === record.message)).toBe(true);
  log.info("outside");
  expect(records.at(-1)?.requestId).toBeUndefined();
});

test("logging failures do not fail the operation", () => {
  const log = createLogger({
    sink: () => {
      throw new Error("sink unavailable");
    },
  });
  expect(() => log.info("done")).not.toThrow();
});

test("unserializable fields cannot fail business work", () => {
  const records: LogRecord[] = [];
  const log = createLogger({ sink: (record) => records.push(record) });
  expect(() => log.info("invalid date", { date: new Date(Number.NaN) })).not.toThrow();
  expect(() =>
    log.info("unavailable property", {
      get value(): never {
        throw new Error("getter unavailable");
      },
    }),
  ).not.toThrow();
  expect(records).toEqual([]);
});
