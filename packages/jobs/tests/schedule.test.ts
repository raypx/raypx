import { expect, it } from "vite-plus/test";
import { cloudJobInputSchema, nextJobRuns } from "../src/index.js";

it("calculates in the selected IANA zone from an explicit instant", () => {
  expect(
    nextJobRuns(
      { cron: "0 9 * * 1-5", timezone: "Asia/Singapore" },
      new Date("2026-10-26T00:00:00Z"),
      2,
    ),
  ).toEqual(["2026-10-26T01:00:00.000Z", "2026-10-27T01:00:00.000Z"]);
  expect(
    nextJobRuns(
      { cron: "0 9 * * *", timezone: "America/New_York" },
      new Date("2026-10-31T00:00:00Z"),
      3,
    ),
  ).toEqual(["2026-10-31T13:00:00.000Z", "2026-11-01T14:00:00.000Z", "2026-11-02T14:00:00.000Z"]);
});

it("rejects invalid calendars and higher-frequency Cron without leaking parser errors", () => {
  for (const schedule of [
    { cron: "* * * * * *", timezone: "UTC" },
    { cron: "not a valid private expression", timezone: "UTC" },
    { cron: "0 9 * * *", timezone: "Unknown/Private" },
    { cron: "0 9 * * *", timezone: "" },
  ])
    expect(() => nextJobRuns(schedule)).toThrow("INVALID_CRON");
  expect(() => nextJobRuns({ cron: "* * * * *", timezone: "UTC" }, new Date(NaN))).toThrow(
    "INVALID_CRON",
  );
});

it("preserves valid long local Cron expressions while cloud inputs keep their own limit", () => {
  const cron = `${Array.from({ length: 60 }, (_, index) => index).join(",")} 9 * * *`;
  expect(cron.length).toBeGreaterThan(120);
  expect(
    nextJobRuns({ cron, timezone: "Asia/Singapore" }, new Date("2026-10-26T00:00:00Z"), 1),
  ).toEqual(["2026-10-26T01:00:00.000Z"]);
  expect(
    cloudJobInputSchema.safeParse({
      name: "Bounded",
      cron,
      timezone: "UTC",
      action: { type: "device.sync", deviceId: "33333333-3333-4333-8333-333333333333", epoch: 1 },
    }).success,
  ).toBe(false);
});

it("excludes arbitrary server commands and caller-selected account ownership", () => {
  const base = { name: "Daily", cron: "0 9 * * *", timezone: "Asia/Singapore", enabled: true };
  expect(
    cloudJobInputSchema.safeParse({
      ...base,
      action: { type: "command.run", command: { executable: "sh" } },
    }).success,
  ).toBe(false);
  const action = {
    type: "device.sync",
    deviceId: "33333333-3333-4333-8333-333333333333",
    epoch: 1,
  };
  expect(cloudJobInputSchema.safeParse({ ...base, action, userId: "other" }).success).toBe(false);
  expect(cloudJobInputSchema.safeParse({ ...base, action: { ...action, epoch: 0 } }).success).toBe(
    false,
  );
});
