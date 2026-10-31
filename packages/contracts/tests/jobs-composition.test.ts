import { expect, it } from "vite-plus/test";
import * as jobs from "@raypx/jobs";
import * as local from "../src/local.js";

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
