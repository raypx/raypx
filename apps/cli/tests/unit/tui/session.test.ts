import type { JobDefinition, JobRun } from "@raypx/contracts/local";
import { describe, expect, it, vi } from "vite-plus/test";
import { runSession, type TuiService } from "../../../src/tui/session";
import type { TuiTerminal } from "../../../src/tui/terminal";

const job: JobDefinition = {
  id: "job-daily",
  name: "Daily report",
  cron: "0 9 * * *",
  timezone: "UTC",
  enabled: true,
  action: { type: "directory.scan", rootId: "root-reports", path: "reports" },
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
  nextRuns: ["2026-10-20T09:00:00.000Z"],
};

function completedRun(overrides: Partial<JobRun> = {}): JobRun {
  return {
    id: "run-latest",
    jobId: job.id,
    startedAt: "2026-10-19T09:00:00.000Z",
    finishedAt: "2026-10-19T09:00:01.000Z",
    status: "success",
    output: "Report produced successfully",
    exitCode: 0,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createService(jobs: JobDefinition[] = [job]) {
  return {
    listJobs: vi.fn<TuiService["listJobs"]>().mockResolvedValue(jobs),
    history: vi.fn<TuiService["history"]>().mockResolvedValue([]),
    run: vi.fn<TuiService["run"]>().mockResolvedValue(completedRun()),
  } satisfies TuiService;
}

function startSession(
  service: TuiService,
  options: { locale?: "en" | "zh"; profile?: string; onQuit?: () => void } = {},
) {
  let output = "";
  let closing = false;
  let closed = false;
  let waiting: ((value: string | null) => void) | undefined;
  const terminal: TuiTerminal = {
    write(text) {
      output += text;
    },
    read(prompt, signal) {
      output += prompt;
      if (closed || signal?.aborted) return Promise.resolve(null);
      if (waiting) throw new Error("The session opened overlapping prompts");
      return new Promise<string | null>((resolve) => {
        const finish = (value: string | null) => {
          signal?.removeEventListener("abort", abort);
          if (waiting === finish) waiting = undefined;
          resolve(value);
        };
        const abort = () => finish(null);
        waiting = finish;
        signal?.addEventListener("abort", abort, { once: true });
      });
    },
    close() {
      closed = true;
      waiting?.(null);
    },
  };
  const quit = vi.fn(() => {
    closing = true;
    terminal.close();
    options.onQuit?.();
  });
  const done = runSession(terminal, service, {
    profile: options.profile ?? "test-profile",
    locale: options.locale ?? "en",
    isClosing: () => closing,
    quit,
  });
  return {
    done,
    quit,
    text: () => output,
    clear: () => {
      output = "";
    },
    async input(value: string | null) {
      await vi.waitFor(() => expect(waiting).toBeDefined());
      waiting!(value);
    },
  };
}

async function openDetails(session: ReturnType<typeof startSession>) {
  await session.input("t");
  await session.input("1");
}

describe("interactive session", () => {
  it("keeps an unavailable task list interactive and can refresh to its empty state", async () => {
    const service = createService([]);
    service.listJobs.mockRejectedValueOnce(new Error("catalog temporarily unavailable"));
    const session = startSession(service);
    await vi.waitFor(() => expect(session.text()).toContain("catalog temporarily unavailable"));
    await session.input("r");
    await vi.waitFor(() => expect(service.listJobs).toHaveBeenCalledTimes(2));
    expect(session.text()).toMatch(/no (tasks|jobs)|0 (tasks|jobs)/i);
    expect(session.quit).not.toHaveBeenCalled();
    await session.input("q");
    await session.done;
    expect(session.quit).toHaveBeenCalledOnce();
    expect(service.run).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before running the selected task and shows its result", async () => {
    const service = createService();
    const session = startSession(service);
    await openDetails(session);
    await session.input("r");
    await session.input("no");
    expect(service.run).not.toHaveBeenCalled();
    await session.input("r");
    await session.input("yes");
    await vi.waitFor(() => expect(session.text()).toContain("Report produced successfully"));
    expect(service.run).toHaveBeenCalledExactlyOnceWith(job.id);
    expect(session.text()).toMatch(/status:\s*success/i);
    await session.input("");
    await session.input("q");
    await session.done;
  });

  it("opens the chosen history record without rerunning or substituting another record's output", async () => {
    const service = createService();
    service.history.mockResolvedValue([
      completedRun({ id: "newest-run", output: "Newest private output" }),
      completedRun({
        id: "older-run",
        startedAt: "2026-10-18T09:00:00.000Z",
        finishedAt: "2026-10-18T09:00:01.000Z",
        status: "failed",
        output: "Older failure details",
        exitCode: 7,
      }),
    ]);
    const session = startSession(service);
    await openDetails(session);
    await session.input("h");
    await vi.waitFor(() => expect(service.history).toHaveBeenCalledExactlyOnceWith(job.id));
    session.clear();
    await session.input("2");
    await vi.waitFor(() => expect(session.text()).toContain("Older failure details"));
    expect(session.text()).toContain("older-run");
    expect(session.text()).toMatch(/status:\s*failed/i);
    expect(session.text()).toMatch(/exit code:\s*7/i);
    expect(session.text()).not.toContain("Newest private output");
    expect(service.run).not.toHaveBeenCalled();
    await session.input("");
    await session.input("q");
    await session.done;
  });

  it("removes terminal control and bidi characters from task metadata and displayed output", async () => {
    const service = createService([
      { ...job, name: "Daily\u001b[31m report\u001b[0m\u0007\u202e injected\u202c" },
    ]);
    service.history.mockResolvedValue([
      completedRun({ output: "Visible line\n\u001b[2JFake menu\u0007\u202e hidden\u202c" }),
    ]);
    const session = startSession(service, { profile: "safe\u001b[2Jprofile\u202e" });
    await openDetails(session);
    await session.input("h");
    await session.input("1");
    await vi.waitFor(() => expect(session.text()).toContain("Visible line"));
    for (const character of ["\u001b", "\u0007", "\u202e", "\u202c"]) {
      expect(session.text()).not.toContain(character);
    }
    expect(session.text()).toContain("| Visible line");
    expect(session.text()).toContain("| Fake menu");
    expect(service.history).toHaveBeenCalledExactlyOnceWith(job.id);
    await session.input("");
    await session.input("q");
    await session.done;
  });

  it("keeps one run active through extra input and requires confirmation to cancel and quit", async () => {
    const pending = deferred<JobRun>();
    const service = createService();
    service.run.mockReturnValue(pending.promise);
    const session = startSession(service, {
      onQuit: () => pending.resolve(completedRun({ status: "cancelled", exitCode: null })),
    });
    await openDetails(session);
    await session.input("r");
    await session.input("yes");
    await vi.waitFor(() => expect(service.run).toHaveBeenCalledExactlyOnceWith(job.id));
    expect(session.text()).toMatch(/running/i);
    await session.input("r");
    await session.input("yes");
    expect(service.run).toHaveBeenCalledOnce();
    await session.input("q");
    await session.input("no");
    expect(session.quit).not.toHaveBeenCalled();
    await session.input("q");
    await session.input("yes");
    await session.done;
    expect(session.quit).toHaveBeenCalledOnce();
    expect(service.run).toHaveBeenCalledOnce();
  });

  it("shows the actual result if execution finishes while cancellation is being confirmed", async () => {
    const pending = deferred<JobRun>();
    const service = createService();
    service.run.mockReturnValue(pending.promise);
    const session = startSession(service);
    await openDetails(session);
    await session.input("r");
    await session.input("yes");
    await vi.waitFor(() => expect(service.run).toHaveBeenCalledOnce());
    await session.input("q");
    await vi.waitFor(() => expect(session.text()).toContain("Type yes to confirm"));
    pending.resolve(completedRun({ output: "Finished before cancellation confirmation" }));
    await vi.waitFor(() =>
      expect(session.text()).toContain("Finished before cancellation confirmation"),
    );
    expect(session.text()).toMatch(/status:\s*success/i);
    expect(session.quit).not.toHaveBeenCalled();
    await session.input("");
    await session.input("q");
    await session.done;
    expect(session.quit).toHaveBeenCalledOnce();
  });

  it("returns to the task after a run error and allows an explicitly confirmed retry", async () => {
    const service = createService();
    service.run.mockRejectedValueOnce(new Error("execution temporarily unavailable"));
    const session = startSession(service);
    await openDetails(session);
    await session.input("r");
    await session.input("yes");
    await vi.waitFor(() => expect(session.text()).toContain("execution temporarily unavailable"));
    expect(session.quit).not.toHaveBeenCalled();
    await session.input("r");
    expect(service.run).toHaveBeenCalledOnce();
    await session.input("yes");
    await vi.waitFor(() => expect(session.text()).toContain("Report produced successfully"));
    expect(service.run).toHaveBeenCalledTimes(2);
    await session.input("");
    await session.input("q");
    await session.done;
  });

  it.each([
    { locale: "en" as const, initial: "Tasks", switched: "任务" },
    { locale: "zh" as const, initial: "任务", switched: "Tasks" },
  ])(
    "starts in $locale and switches the session language",
    async ({ locale, initial, switched }) => {
      const session = startSession(createService([]), { locale });
      await vi.waitFor(() => expect(session.text()).toContain(initial));
      session.clear();
      await session.input("l");
      await vi.waitFor(() => expect(session.text()).toContain(switched));
      await session.input("q");
      await session.done;
      expect(session.quit).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { name: "idle", inputs: [] },
    { name: "running", inputs: ["t", "1", "r", "yes"] },
  ])("quits cleanly on EOF while $name", async ({ inputs }) => {
    const pending = deferred<JobRun>();
    const service = createService();
    service.run.mockReturnValue(pending.promise);
    const session = startSession(service, {
      onQuit: () => pending.resolve(completedRun({ status: "cancelled", exitCode: null })),
    });
    for (const input of inputs) await session.input(input);
    await session.input(null);
    await session.done;
    expect(session.quit).toHaveBeenCalledOnce();
    expect(service.run).toHaveBeenCalledTimes(inputs.length === 0 ? 0 : 1);
  });
});
