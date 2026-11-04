import { jobDefinitionSchema, jobRunSchema } from "@raypx/jobs";
import type { RecordDiagnostic } from "../diagnostics";
import type { LocalRuntime } from "../runtime";
import { runSession } from "./session";
import { createTerminal } from "./terminal";
import { terminalLocale } from "./text";
import { onShutdown } from "../transport/shutdown";

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
  const removeSignals = onShutdown((signal) => stop(signal === "SIGINT" ? 130 : 143));
  try {
    const { createExecutionOwner } = await import("../runtime/owner");
    if (stopped) return exitCode;
    runtime = createExecutionOwner({ ...options, mode: "tui" }).runtime;
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
      removeSignals();
    }
  }
  return exitCode;
}
