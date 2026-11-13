import { describe, expect, it, vi } from "vitest";
import { createRuntime, enrolledInstance, startDaemon } from "../../helpers/enrolled.js";
import { acquireLock } from "../../../src/runtime/state/index.js";
import type { Diagnostic } from "../../../src/diagnostics.js";
import { LocalError } from "../../../src/runtime/errors.js";
import { runtimeFixtures } from "../../helpers/runtime.js";
import { aiFixture } from "../../helpers/ai.js";
import { writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import type { JobRun } from "@raypx/core/jobs";
import { parseCliArgs } from "../../../src/commands/args.js";
import { runCommand } from "../../../src/commands/index.js";

const { fixture, runtimes } = runtimeFixtures();

describe("device jobs and leases", () => {
  it("runs a Pi automation through the local session and approval flow", async () => {
    const { runtime, grant, dir, authorized } = await fixture();
    const server = aiFixture({
      toolSequence: [
        {
          name: "files_write",
          arguments: { path: "routine.txt", text: "approved", version: null },
        },
        null,
      ],
    });
    vi.stubEnv("RAYPX_HOME", dir);
    let host: Awaited<ReturnType<typeof startDaemon>> | undefined;
    try {
      await writeFile(
        join(dir, "config.toml"),
        `[ai]\nprovider = "local"\nmodel = "fixture-model"\napi = "openai-completions"\nbase_url = "${server.url}"\n`,
      );
      await runtime.request("agents.configure", { rootId: grant.id, providers: ["pi"] });
      const job = (await runtime.request("jobs.create", {
        projectId: grant.id,
        name: "Pi routine",
        cron: "0 9 * * 1-5",
        timezone: "UTC",
        enabled: false,
        action: { type: "agent.run", prompt: "Check routine status" },
      })) as { id: string };
      await runtime.close();
      host = await startDaemon({ dataDir: dir });
      const live = host.runtime;
      const output = vi.spyOn(console, "log").mockImplementation(() => {});
      let run: JobRun;
      try {
        await runCommand(parseCliArgs(["jobs", "run", JSON.stringify({ id: job.id }), "--json"]), {
          dataDir: dir,
          instanceAccess: enrolledInstance,
        });
        run = JSON.parse(String(output.mock.calls[0]?.[0])) as JobRun;
      } finally {
        output.mockRestore();
      }
      expect(run.status).toBe("running");
      await expect.poll(() => live.agents.localApprovals(LOCAL_WORKSPACE_ID)).toHaveLength(1);
      const [request] = live.agents.localApprovals(LOCAL_WORKSPACE_ID);
      expect(request).toMatchObject({ taskId: run.id, kind: "permission" });
      await expect(stat(join(authorized, "routine.txt"))).rejects.toMatchObject({ code: "ENOENT" });
      const history = live.jobs.history(job.id);
      expect(history[0]).toMatchObject({
        status: "running",
        session: { taskId: run.id, projectId: grant.id },
      });
      expect(
        await live.agents.localExecute(LOCAL_WORKSPACE_ID, crypto.randomUUID(), {
          method: "approvals.decide",
          input: { id: request!.id, decision: { type: "allow" } },
        }),
      ).toMatchObject({ ok: true });
      await expect.poll(() => live.jobs.history(job.id)[0]?.status).toBe("success");
      expect(live.agents.localTask(LOCAL_WORKSPACE_ID, run.id, 0).task).toMatchObject({
        status: "succeeded",
        prompt: "Check routine status",
        summary: "PI_AI_READY",
      });
      expect(await Bun.file(join(authorized, "routine.txt")).text()).toBe("approved");
      expect(server.requests).toHaveLength(2);

      // A crash after task completion can leave only the initial run record.
      live.state.putRun(run);
      await host.close();
      const reopened = createRuntime({ dataDir: dir });
      runtimes.push(reopened);
      expect(reopened.jobs.history(job.id)).toMatchObject([
        { status: "success", session: { taskId: run.id, projectId: grant.id } },
      ]);
      expect(server.requests).toHaveLength(2);
    } finally {
      await runtime.close();
      await host?.close();
      await server.stop();
      vi.unstubAllEnvs();
    }
  });

  it("deduplicates a Cron occurrence and discards a trigger superseded by pause or edit", async () => {
    const { runtime, grant, dir } = await fixture();
    const job = runtime.jobs.create({
      name: "Scan once per occurrence",
      cron: "* * * * *",
      timezone: "UTC",
      enabled: true,
      action: { type: "directory.scan", rootId: grant.id, path: "" },
    });
    const due = new Date(job.nextRuns[0]!);
    const [first, duplicate] = await Promise.all([
      runtime.jobs.run(job.id, due),
      runtime.jobs.run(job.id, due),
    ]);
    expect(first).toMatchObject({ scheduledFor: due.toISOString(), status: "success" });
    expect(duplicate.id).toBe(first.id);
    expect(runtime.jobs.history(job.id)).toEqual([first]);
    await runtime.close();
    const reopened = createRuntime({ dataDir: dir });
    runtimes.push(reopened);
    expect(await reopened.jobs.run(job.id, due)).toEqual(first);
    const next = new Date(due.getTime() + 60_000);
    reopened.jobs.update(job.id, { ...job, enabled: false });
    await expect(reopened.jobs.run(job.id, next)).rejects.toMatchObject({
      code: "SCHEDULE_CHANGED",
    });
    reopened.jobs.update(job.id, { ...job, cron: "0 9 1 1 *" });
    const oldOccurrence = new Date("2026-11-13T09:00:00.000Z");
    await expect(reopened.jobs.run(job.id, oldOccurrence)).rejects.toMatchObject({
      code: "SCHEDULE_CHANGED",
    });
    expect(reopened.jobs.history(job.id)).toEqual([first]);
  });

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
