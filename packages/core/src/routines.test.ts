import { expect, it } from "vitest";
import { nextRoutineDue, routineInputSchema } from "./routines.js";

it("accepts five-field schedules in named time zones and rejects extra fields", () => {
  const base = { agentId: "agent", name: "Daily", prompt: "Summarize", enabled: true };
  expect(
    routineInputSchema.safeParse({
      ...base,
      triggers: { schedule: { cron: "0 9 * * *", timezone: "Asia/Shanghai" } },
    }).success,
  ).toBe(true);
  expect(
    nextRoutineDue(
      { schedule: { cron: "0 9 * * *", timezone: "Asia/Shanghai" } },
      new Date("2026-11-13T01:00:00Z"),
    )?.toISOString(),
  ).toBe("2026-11-14T01:00:00.000Z");
  for (const schedule of [
    { cron: "* * * * * *", timezone: "UTC" },
    { cron: "0 9 * * *", timezone: "Unknown/Zone" },
  ]) {
    expect(routineInputSchema.safeParse({ ...base, triggers: { schedule } }).success).toBe(false);
  }
  expect(routineInputSchema.safeParse({ ...base, triggers: {} }).success).toBe(false);
});

it("requires an allowed sender and distinct neutral repository event kinds", () => {
  const base = { agentId: "agent", name: "Inbound", prompt: "Review", enabled: true };
  const input = routineInputSchema.parse({
    ...base,
    triggers: { email: { allowedSender: "Person@Example.test" }, repository: { events: ["push"] } },
  });
  expect(input.triggers.email?.allowedSender).toBe("person@example.test");
  expect(
    routineInputSchema.safeParse({
      ...base,
      triggers: { repository: { events: ["push", "push"] } },
    }).success,
  ).toBe(false);
});
