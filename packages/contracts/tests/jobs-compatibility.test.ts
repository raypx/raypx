import { expect, it } from "vite-plus/test";
import * as jobs from "@raypx/jobs";
import * as local from "../src/local.js";

it("retains local job and command exports as the shared schema instances", () => {
  expect(local.commandSchema).toBe(jobs.commandSchema);
  expect(local.jobActionSchema).toBe(jobs.jobActionSchema);
  expect(local.jobInputSchema).toBe(jobs.jobInputSchema);
  expect(local.jobDefinitionSchema).toBe(jobs.jobDefinitionSchema);
  expect(local.jobRunSchema).toBe(jobs.jobRunSchema);
  expect(local.localParams["jobs.create"]).toBe(jobs.jobInputSchema);
  expect(
    local.jobInputSchema.parse({
      name: "Existing local job",
      cron: "0 9 * * *",
      timezone: "Asia/Singapore",
      action: { type: "command.run", command: { executable: "node", cwd: "/authorized" } },
    }),
  ).toEqual({
    name: "Existing local job",
    cron: "0 9 * * *",
    timezone: "Asia/Singapore",
    enabled: true,
    action: {
      type: "command.run",
      command: { executable: "node", cwd: "/authorized", args: [], timeoutMs: 600_000 },
    },
  });
});
