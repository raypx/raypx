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

it("requires a project and nonempty instructions for local Pi automations", () => {
  const input = {
    name: "Review changes",
    cron: "0 9 * * 1-5",
    timezone: "UTC",
    action: { type: "agent.run", prompt: "  Check project status  " },
  };
  const projectId = "f60962e3-954e-4b15-b96f-c9e88f7be8f8";
  expect(local.localParams["jobs.create"].safeParse(input).success).toBe(false);
  expect(
    local.localParams["jobs.create"].safeParse({
      ...input,
      projectId,
      action: { type: "agent.run", prompt: "  " },
    }).success,
  ).toBe(false);
  expect(local.localParams["jobs.update"].parse({ ...input, projectId, id: "job" })).toMatchObject({
    projectId,
    action: { type: "agent.run", prompt: "Check project status" },
  });
});

it("accepts event-only Pi routines and keeps command jobs behind a schedule", () => {
  const job = {
    name: "Inbound",
    projectId: "f60962e3-954e-4b15-b96f-c9e88f7be8f8",
    action: { type: "agent.run", prompt: "Summarize" },
    triggers: { webhook: true, email: { sender: " Owner@Example.com " } },
  };
  const create = local.localParams["jobs.create"];
  expect(create.parse(job).triggers?.email?.sender).toBe("owner@example.com");
  expect(create.safeParse({ ...job, triggers: {} }).success).toBe(false);
  expect(create.safeParse({ ...job, cron: "* * * * *" }).success).toBe(false);
  expect(
    create.safeParse({
      ...job,
      action: { type: "command.run", command: { executable: "git", cwd: "/project" } },
    }).success,
  ).toBe(false);
});

it("binds file watches to project-relative paths and normalizes GitHub configuration", () => {
  const input = {
    name: "Watch source",
    projectId: "f60962e3-954e-4b15-b96f-c9e88f7be8f8",
    action: { type: "agent.run", prompt: "Summarize" },
    triggers: {
      files: { path: "./src\\tests", intervalMinutes: 5 },
      github: { repository: "Owner/Repo", events: ["push"] },
    },
  };
  const create = local.localParams["jobs.create"];
  expect(create.parse(input).triggers).toEqual({
    files: { path: "src/tests", intervalMinutes: 5 },
    github: { repository: "owner/repo", events: ["push"] },
  });
  expect(create.safeParse({ ...input, cron: "* * * * *", timezone: "UTC" }).success).toBe(false);
  for (const path of ["../outside", "/outside", "C:\\outside", "src/../../outside"])
    expect(
      create.safeParse({ ...input, triggers: { files: { path, intervalMinutes: 5 } } }).success,
    ).toBe(false);
});
