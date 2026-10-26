import { afterEach, expect, it, vi } from "vite-plus/test";
import type { CloudJobsService } from "@raypx/jobs/server";
import type { SafeEvent } from "@raypx-kit/logger/safe";
import { createScheduleTick } from "../../../server/jobs/tick.js";
import { createApiLogging, type ApiLogging } from "../../../server/logging.js";

let logger: ApiLogging | undefined;
afterEach(async () => {
  await logger?.close();
});
function fixture(enabled: boolean) {
  const events: SafeEvent[] = [];
  logger = createApiLogging({
    environment: "test",
    sink: ({ event }) => {
      events.push(event);
    },
  });
  const tick = vi.fn(async () => ({ enabled: true, claimed: 2, reconciled: 3, failed: 0 }));
  return {
    events,
    tick,
    run: createScheduleTick({ tick } as unknown as CloudJobsService, logger, enabled),
  };
}
it("performs no service/database work when scheduling is disabled", async () => {
  const f = fixture(false);
  expect(await f.run()).toEqual({ enabled: false, claimed: 0, reconciled: 0, failed: 0 });
  expect(f.tick).not.toHaveBeenCalled();
});
it("records only fixed task metadata and aggregate counts", async () => {
  const f = fixture(true);
  expect(await f.run()).toEqual({ enabled: true, claimed: 2, reconciled: 3, failed: 0 });
  await logger!.flush();
  expect(f.events[0]).toMatchObject({
    operation: "job.schedules",
    status: 200,
    job: { name: "schedules:tick", claimed: "2", reconciled: "3" },
  });
});
it("sanitizes database or relay errors before propagating scheduler failure", async () => {
  const f = fixture(true);
  f.tick.mockRejectedValue(new Error("private-device-prompt-and-password"));
  await expect(f.run()).rejects.toThrow(/^Schedule task failed$/);
  await logger!.flush();
  expect(JSON.stringify(f.events)).not.toContain("private-device-prompt-and-password");
});
