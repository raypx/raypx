import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "../../helpers/enrolled.js";
import { acquireLock } from "../../../src/runtime/state/index.js";
import type { Diagnostic } from "../../../src/diagnostics.js";
import { LocalError } from "../../../src/runtime/errors.js";
import { runtimeFixtures } from "../../helpers/runtime.js";

const { fixture, runtimes } = runtimeFixtures();

describe("device jobs and leases", () => {
  it("recovers interrupted history on read without replaying a job or changing a live owner's run", async () => {
    const { runtime, grant, dir } = await fixture();
    const job = runtime.jobs.create({
      name: "Scan",
      cron: "0 9 * * *",
      timezone: "UTC",
      enabled: false,
      action: { type: "directory.scan", rootId: grant.id, path: "" },
    });
    const run = {
      id: crypto.randomUUID(),
      jobId: job.id,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running" as const,
      output: "Retained output",
      exitCode: null,
    };
    runtime.state.putRun(run);
    const release = acquireLock(runtime.state.directory, `job-${job.id}`)!;
    const reader = createRuntime({ dataDir: dir });
    runtimes.push(reader);
    try {
      expect(await reader.request("jobs.history", { id: job.id })).toEqual([run]);
    } finally {
      release();
    }
    await runtime.close();
    const scan = vi.spyOn(reader.files, "scan");
    expect(await reader.request("jobs.history", { id: job.id })).toEqual([
      { ...run, status: "interrupted", finishedAt: expect.any(String) },
    ]);
    expect(scan).not.toHaveBeenCalled();
    expect(reader.state.history(job.id)[0]?.status).toBe("interrupted");
  });

  it.each(["start", "finish"] as const)(
    "releases the job lease if persisting the %s record fails",
    async (phase) => {
      const { runtime, grant } = await fixture();
      const job = runtime.jobs.create({
        name: "Scan",
        cron: "0 9 * * *",
        timezone: "UTC",
        enabled: false,
        action: { type: "directory.scan", rootId: grant.id, path: "" },
      });
      const persist = runtime.state.putRun.bind(runtime.state);
      const write = vi.spyOn(runtime.state, "putRun").mockImplementation((run) => {
        if ((run.status === "running") === (phase === "start"))
          throw new Error("Unavailable run storage");
        persist(run);
      });
      await expect(runtime.jobs.run(job.id)).rejects.toThrow("Unavailable run storage");
      write.mockRestore();
      expect(await runtime.jobs.run(job.id)).toMatchObject({ status: "success" });
    },
  );

  it("recovers disabled jobs when the scheduler starts and releases its lease after failed recovery", async () => {
    const { runtime, grant, dir } = await fixture();
    const job = runtime.jobs.create({
      name: "Scan",
      cron: "0 9 * * *",
      timezone: "UTC",
      enabled: false,
      action: { type: "directory.scan", rootId: grant.id, path: "" },
    });
    runtime.state.putRun({
      id: crypto.randomUUID(),
      jobId: job.id,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running",
      output: "",
      exitCode: null,
    });
    const write = vi.spyOn(runtime.state, "putRun").mockImplementation(() => {
      throw new Error("Unavailable run storage");
    });
    expect(() => runtime.jobs.startScheduler()).toThrow("Unavailable run storage");
    write.mockRestore();
    const scheduler = createRuntime({ dataDir: dir, mode: "stdio" });
    runtimes.push(scheduler);
    expect(scheduler.state.history(job.id)[0]).toMatchObject({
      status: "interrupted",
      finishedAt: expect.any(String),
    });
  });

  it("persists optional project associations while retaining unassigned plans after restart", async () => {
    const { runtime, grant, dir } = await fixture();
    const input = {
      name: "Project scan",
      cron: "0 9 * * *",
      timezone: "UTC",
      enabled: false,
      action: { type: "directory.scan" as const, rootId: grant.id, path: "" },
    };
    const scoped = runtime.jobs.create({ ...input, projectId: grant.id });
    const global = runtime.jobs.create({ ...input, name: "General scan" });
    await runtime.close();
    const reopened = createRuntime({ dataDir: dir });
    runtimes.push(reopened);
    expect(reopened.jobs.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: scoped.id, projectId: grant.id }),
        expect.objectContaining({ id: global.id, name: "General scan" }),
      ]),
    );
    expect(reopened.jobs.list().find((job) => job.id === global.id)).not.toHaveProperty(
      "projectId",
    );
  });
  it("records one bounded summary for completed and skipped runs without private job data", async () => {
    const diagnostics: Diagnostic[] = [];
    const { runtime, grant } = await fixture((event) => diagnostics.push(event));
    const task = runtime.jobs.create({
      name: "private-task-name",
      cron: "0 * * * *",
      timezone: "Asia/Singapore",
      enabled: true,
      action: { type: "directory.scan", rootId: grant.id, path: "" },
    });
    const release = acquireLock(runtime.state.directory, `job-${task.id}`)!;
    const skipped = await runtime.jobs.run(task.id);
    release();
    const success = await runtime.jobs.run(task.id);
    runtime.jobs.update(task.id, {
      ...task,
      action: { type: "directory.scan", rootId: grant.id, path: "private-missing-path" },
    });
    const failed = await runtime.jobs.run(task.id);
    expect(diagnostics).toEqual(
      [skipped, success, failed].map((run) => ({
        operation: "job.completed",
        id: run.id,
        jobId: task.id,
        status: run.status,
        exitCode: run.exitCode,
        elapsedMs: expect.any(Number),
        ...(run.status === "failed" ? { code: "LOCAL_ERROR" } : {}),
      })),
    );
    expect(JSON.stringify(diagnostics)).not.toContain("private-");
    expect(JSON.stringify(diagnostics)).not.toContain(runtime.state.directory);
    expect(diagnostics.every((event) => "elapsedMs" in event && event.elapsedMs >= 0)).toBe(true);
  });

  it("measures the operation lifetime before creating its completion diagnostic", async () => {
    const diagnostics: Diagnostic[] = [];
    const { runtime, grant } = await fixture((event) => diagnostics.push(event));
    const task = runtime.jobs.create({
      name: "Scan",
      cron: "0 * * * *",
      timezone: "UTC",
      enabled: false,
      action: { type: "directory.scan", rootId: grant.id, path: "" },
    });
    const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
    try {
      vi.spyOn(runtime.files, "scan").mockImplementation(async () => {
        clock.mockReturnValue(1250);
        return { files: 0, directories: 1, bytes: 0, skipped: 0 };
      });
      await runtime.jobs.run(task.id);
      expect(diagnostics).toEqual([
        expect.objectContaining({ operation: "job.completed", elapsedMs: 250 }),
      ]);
    } finally {
      clock.mockRestore();
    }
  });

  it("keeps a diagnostic sink failure separate from a job result", async () => {
    const { runtime, grant } = await fixture(() => {
      throw new Error("Unavailable diagnostic sink");
    });
    const task = runtime.jobs.create({
      name: "Scan",
      cron: "0 * * * *",
      timezone: "Asia/Singapore",
      enabled: true,
      action: { type: "directory.scan", rootId: grant.id, path: "" },
    });
    await expect(runtime.jobs.run(task.id)).resolves.toMatchObject({ status: "success" });
    expect(runtime.state.history(task.id)[0]?.status).toBe("success");
  });

  it("records scheduler failures using a safe code instead of exception text", async () => {
    const diagnostics: Diagnostic[] = [];
    const { runtime, grant } = await fixture((event) => diagnostics.push(event));
    const task = runtime.jobs.create({
      name: "Scan",
      cron: "* * * * *",
      timezone: "UTC",
      enabled: true,
      action: { type: "directory.scan", rootId: grant.id, path: "" },
    });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      vi.spyOn(runtime.jobs, "run").mockRejectedValue(
        new LocalError("JOB_NOT_FOUND", "private-path secret-token"),
      );
      runtime.jobs.startScheduler();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(diagnostics).toEqual([
        { operation: "scheduler.failed", jobId: task.id, code: "JOB_NOT_FOUND" },
      ]);
    } finally {
      await runtime.close();
      vi.useRealTimers();
    }
  });

  it("excludes a second scheduler and releases the lease after shutdown", async () => {
    const { dir } = await fixture();
    const first = createRuntime({ dataDir: dir, mode: "stdio" });
    runtimes.push(first);
    expect(() => createRuntime({ dataDir: dir, mode: "stdio" })).toThrow(/Another Desktop/);
    await first.close();
    runtimes.splice(runtimes.indexOf(first), 1);
    const second = createRuntime({ dataDir: dir, mode: "stdio" });
    runtimes.push(second);
    expect(second.jobs.list()).toEqual([]);
  });

  it("persists task definitions and skips manual execution while another owner holds its lease", async () => {
    const { runtime, grant } = await fixture();
    const task = runtime.jobs.create({
      name: "Scan",
      cron: "0 * * * *",
      timezone: "Asia/Singapore",
      enabled: true,
      action: { type: "directory.scan", rootId: grant.id, path: "" },
    });
    expect(task.nextRuns).toHaveLength(5);
    const release = acquireLock(runtime.state.directory, `job-${task.id}`)!;
    expect((await runtime.jobs.run(task.id)).status).toBe("skipped");
    release();
    expect((await runtime.jobs.run(task.id)).status).toBe("success");
    expect(runtime.state.history(task.id)).toHaveLength(2);
    expect(() => runtime.jobs.create({ ...task, cron: "* * * * * *" })).toThrow(/five-field/);
  });
});
