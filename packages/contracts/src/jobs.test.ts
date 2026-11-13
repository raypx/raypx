import { expect, it } from "vitest";
import * as jobs from "@raypx/core/jobs";
import * as local from "./local.js";

it("composes local job commands with the shared domain schema", () => {
  expect(local.localParams["jobs.create"]).toBe(jobs.jobInputSchema);
  expect(
    local.localParams["jobs.create"].parse({
      name: "Local job",
      cron: "0 9 * * *",
      timezone: "Asia/Singapore",
      action: { type: "command.run", command: { executable: "bun", cwd: "/authorized" } },
    }),
  ).toEqual({
    name: "Local job",
    cron: "0 9 * * *",
    timezone: "Asia/Singapore",
    enabled: true,
    action: {
      type: "command.run",
      command: { executable: "bun", cwd: "/authorized", args: [], timeoutMs: 600_000 },
    },
  });
});
