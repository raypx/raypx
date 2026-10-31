import { jobDefinitionSchema, jobRunSchema } from "@raypx/jobs";
import type { RecordDiagnostic } from "../diagnostics";
import type { LocalRuntime } from "../runtime";
import { runSession } from "./session";
import { createTerminal } from "./terminal";
import { terminalLocale } from "./text";

export async function runTui(options: {
  dataDir?: string;
  profile?: string;
  recordDiagnostic?: RecordDiagnostic;
}) {
  let runtime: LocalRuntime | undefined;
  let closing: Promise<void> | undefined;
  let stopped = false;
  let exitCode = 0;
  const terminal = createTerminal({ onInterrupt: () => stop(130) });
  function stop(code = 0) {
    if (code) exitCode = code;
    stopped = true;
    terminal.close();
    if (runtime && !closing) {
      closing = runtime.close();
      // The finally block awaits and propagates cleanup errors.
      void closing.catch(() => {});
    }
  }
  const interrupt = () => stop(130);
  const terminate = () => stop(143);
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    const { createRuntime } = await import("../runtime");
    if (stopped) return exitCode;
    runtime = createRuntime({ ...options, scheduler: false });
    const activeRuntime = runtime;
    await runSession(
      terminal,
      {
        async listJobs() {
          return jobDefinitionSchema.array().parse(await activeRuntime.request("jobs.list", {}));
        },
        async history(id) {
          return jobRunSchema.array().parse(await activeRuntime.request("jobs.history", { id }));
        },
        async run(id) {
          return jobRunSchema.parse(await activeRuntime.request("jobs.run", { id }));
        },
      },
      {
        profile: options.profile ?? "default",
        locale: terminalLocale(),
        isClosing: () => stopped,
        quit: () => stop(),
      },
    );
  } finally {
    stop();
    try {
      await closing;
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    }
  }
  return exitCode;
}
