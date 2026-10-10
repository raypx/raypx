import type { ProcessOptions, run } from "../process.ts";
import { verifyGates, type VerifyGate } from "./gates.ts";
import { elapsed, failureOutput, type VerifyReport, type VerifyStageResult } from "./report.ts";

export interface VerifyDependencies {
  repositoryRoot: string;
  environment: NodeJS.ProcessEnv;
  runCommand: typeof run;
  runConsumers(options: ProcessOptions): Promise<void>;
  now(): number;
  log(message: string): void;
  output(chunk: string, stream: "stdout" | "stderr"): void;
}

export interface VerifyOptions {
  verbose?: boolean;
  signal?: AbortSignal;
  gates?: readonly VerifyGate[];
}

/** Run each gate once, stop on the first failure, and retain a bounded stage report. */
export async function runVerify(
  dependencies: VerifyDependencies,
  options: VerifyOptions = {},
): Promise<VerifyReport> {
  const gates = options.gates ?? verifyGates;
  const environment = { ...dependencies.environment, NODE_ENV: dependencies.environment.NODE_ENV };
  const started = dependencies.now();
  const stages: VerifyStageResult[] = [];
  let cancelled = false;
  for (const [index, gate] of gates.entries()) {
    if (options.signal?.aborted) {
      cancelled = true;
      stages.push(
        ...gates.slice(index).map((pending) => ({
          id: pending.id,
          status: "skipped" as const,
          durationMs: 0,
        })),
      );
      break;
    }
    const stageStarted = dependencies.now();
    const deadline = new AbortController();
    const timer = setTimeout(
      () => deadline.abort(new Error("Verification stage deadline exceeded")),
      gate.timeoutMs,
    );
    const signal = options.signal
      ? AbortSignal.any([options.signal, deadline.signal])
      : deadline.signal;
    const processOptions: ProcessOptions = {
      signal,
      ...(options.verbose
        ? {
            onOutput: (chunk: string, stream: "stdout" | "stderr") =>
              dependencies.output(chunk, stream),
          }
        : {}),
    };
    dependencies.log(`[${index + 1}/${gates.length}] ${gate.label}: started`);
    try {
      if (gate.kind === "command") {
        await dependencies.runCommand(
          gate.command,
          [...gate.args],
          dependencies.repositoryRoot,
          gate.timeoutMs,
          environment,
          processOptions,
        );
      } else {
        await dependencies.runConsumers(processOptions);
      }
      signal.throwIfAborted();
      const durationMs = Math.max(0, dependencies.now() - stageStarted);
      stages.push({ id: gate.id, status: "passed", durationMs });
      dependencies.log(
        `[${index + 1}/${gates.length}] ${gate.label}: passed (${elapsed(durationMs)})`,
      );
    } catch (error) {
      cancelled = options.signal?.aborted ?? false;
      const durationMs = Math.max(0, dependencies.now() - stageStarted);
      const diagnostic = failureOutput(error, environment);
      const failure =
        deadline.signal.aborted && !cancelled
          ? `Stage exceeded its ${elapsed(gate.timeoutMs)} deadline.\n${diagnostic}`
          : diagnostic;
      stages.push({ id: gate.id, status: cancelled ? "cancelled" : "failed", durationMs, failure });
      stages.push(
        ...gates.slice(index + 1).map((pending) => ({
          id: pending.id,
          status: "skipped" as const,
          durationMs: 0,
        })),
      );
      dependencies.log(
        `[${index + 1}/${gates.length}] ${gate.label}: ${cancelled ? "cancelled" : "failed"} (${elapsed(durationMs)})`,
      );
      dependencies.log(
        `Command: ${gate.kind === "command" ? [gate.command, ...gate.args].join(" ") : "prepared consumer validation (core, server, browser)"}`,
      );
      dependencies.log(failure);
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  const durationMs = Math.max(0, dependencies.now() - started);
  const ok = !cancelled && stages.every((stage) => stage.status === "passed");
  dependencies.log(
    `Verification ${ok ? "passed" : cancelled ? "cancelled" : "failed"} (${elapsed(durationMs)}).`,
  );
  return { ok, cancelled, durationMs, stages };
}
