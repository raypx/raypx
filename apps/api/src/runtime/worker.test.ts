import { expect, it, vi } from "vitest";
import type { Database } from "@raypx/database/connection";
import { getWorkerEnvironment } from "../env.js";
import { createApiLogging } from "../logging.js";
import { createWorkerRuntime } from "./worker.js";

it("constructs without database writes or API configuration and exposes only health routes", async () => {
  const logger = createApiLogging({ environment: "test", sink: () => {} });
  const close = vi.fn(async () => {});
  const runtime = await createWorkerRuntime(getWorkerEnvironment({ NODE_ENV: "test" }), {
    // Any construction-time database operation would fail immediately.
    connect: () => ({ db: {} as Database, close }),
    logger,
    closeLogger: () => logger.close(),
    createConversationFanout: () => ({
      subscribe: async () => async () => {},
      close: async () => {},
    }),
  });
  try {
    expect(await (await runtime.app.request("/health")).json()).toEqual({
      status: "ok",
      service: "worker",
    });
    for (const path of ["/rpc/account.get", "/api/auth/get-session", "/events", "/relay"])
      expect((await runtime.app.request(path)).status).toBe(404);
  } finally {
    await runtime.close();
  }
  expect(close).toHaveBeenCalledOnce();
});
