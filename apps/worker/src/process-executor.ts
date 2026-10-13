import { fork } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { CloudApplication } from "@raypx/application";
import type { CloudLimits, CloudRun } from "@raypx/core";

export interface RunnerBootstrap {
  run: CloudRun;
  epoch: number;
  ownerId: string;
  credential: string;
  gatewayUrl: string;
  directory: string;
}
export function runnerEnvironment(): NodeJS.ProcessEnv {
  return { NODE_ENV: "production", PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC" };
}
export function createProcessExecutor(options: {
  app: CloudApplication;
  ownerId: string;
  gatewayUrl: string;
  limits: CloudLimits;
  workerEntry?: string;
  onError?: (error: unknown, runId: string) => void;
}) {
  return async (runId: string, signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) return;
    const workerEntry = resolve(options.workerEntry ?? process.argv[1]!);
    const claimed = await options.app.claim({ runId, ownerId: options.ownerId });
    if (!claimed) return;
    const fence = { runId, ownerId: options.ownerId, epoch: claimed.epoch };
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), "raypx-cloud-run-"));
      directory = await realpath(directory);
      const grantId = crypto.randomUUID(),
        token = randomBytes(32).toString("base64url");
      const processGroup = process.platform !== "win32";
      const child = fork(workerEntry, ["--runner"], {
        cwd: directory,
        env: runnerEnvironment(),
        execPath: process.execPath,
        execArgv: ["--no-env-file", "--no-install"],
        serialization: "advanced",
        detached: processGroup,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      let stopping = false,
        renewal = false,
        finished = false;
      let signalReady!: (ready: boolean) => void;
      const ready = new Promise<boolean>((resolve) => {
        signalReady = resolve;
      });
      const exited = new Promise<void>((resolve, reject) => {
        child.once("error", (error) => {
          signalReady(false);
          reject(error);
        });
        child.once("exit", () => {
          signalReady(false);
          resolve();
        });
      });
      void exited.catch(() => undefined);
      child.on("message", (message: unknown) => {
        if (typeof message !== "object" || message === null || !("type" in message)) return;
        if (message.type === "ready") signalReady(true);
        if (message.type === "done") finished = true;
      });
      let killTimer: NodeJS.Timeout | undefined;
      let stopReason: "budget_exceeded" | "interrupted" | undefined;
      const alive = () => child.exitCode === null && child.signalCode === null;
      const terminate = (signal: NodeJS.Signals) => {
        if (processGroup && child.pid !== undefined) {
          try {
            // The detached Runner leads its own group; converters inherit that group.
            process.kill(-child.pid, signal);
            return;
          } catch (error) {
            if (!(error && typeof error === "object" && "code" in error && error.code === "ESRCH"))
              options.onError?.(error, runId);
          }
        }
        // Windows and a failed Unix spawn retain direct-Runner termination.
        if (alive()) child.kill(signal);
      };
      const stop = (reason: "budget_exceeded" | "interrupted") => {
        if (stopping) return;
        stopping = true;
        stopReason = reason;
        signalReady(false);
        if (!alive()) return;
        if (child.connected)
          child.send({ type: "abort", reason }, (error) => {
            if (error) terminate("SIGTERM");
          });
        else terminate("SIGTERM");
        killTimer = setTimeout(() => {
          terminate("SIGKILL");
        }, 2000);
        killTimer.unref();
      };
      const onAbort = () => stop("interrupted");
      signal?.addEventListener("abort", onAbort, { once: true });
      const duration = claimed.run.mode === "search" ? 60_000 : options.limits.taskDurationMs;
      const remaining = Math.max(
        0,
        (claimed.run.startedAt?.getTime() ?? Date.now()) + duration - Date.now(),
      );
      const deadline = setTimeout(() => stop("budget_exceeded"), remaining);
      deadline.unref();
      if (signal?.aborted) onAbort();
      const renew = async () => {
        if (renewal || stopping || finished) return;
        renewal = true;
        try {
          const run = await options.app.heartbeat(fence);
          if (stopping || finished) return;
          await options.app.renewExecutionGrant({
            ...fence,
            grantId,
            expiresAt: run.leaseExpiresAt!,
          });
        } catch (error) {
          options.onError?.(error, runId);
          stop("interrupted");
        } finally {
          renewal = false;
        }
      };
      const timer = setInterval(() => {
        void renew();
      }, 10_000);
      timer.unref();
      try {
        await options.app.registerExecutionGrant({
          ...fence,
          grantId,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: claimed.run.leaseExpiresAt!,
          actions: ["bootstrap", "invoke"],
        });
        if ((await ready) && !stopping && alive())
          child.send(
            {
              type: "start",
              bootstrap: {
                run: claimed.run,
                epoch: claimed.epoch,
                ownerId: options.ownerId,
                credential: `${grantId}.${token}`,
                gatewayUrl: options.gatewayUrl,
                directory,
              } satisfies RunnerBootstrap,
            },
            (error) => {
              if (error) {
                options.onError?.(error, runId);
                stop("interrupted");
              }
            },
          );
        await exited;
      } finally {
        clearInterval(timer);
        clearTimeout(deadline);
        if (alive()) {
          stop("interrupted");
          await exited.catch(() => undefined);
        }
        if (killTimer) clearTimeout(killTimer);
        signal?.removeEventListener("abort", onAbort);
        // Runner exit does not imply that its native converters exited with it.
        // Stop the remaining group before revocation/finalization and scratch removal.
        terminate("SIGKILL");
        await options.app.revokeExecutionGrant({ grantId }).catch(() => undefined);
        // Fenced finalization preserves terminal Runs and any newer execution owner.
        await (
          stopReason === "budget_exceeded"
            ? options.app.finish({ ...fence, status: "failed", error: "BUDGET_EXCEEDED" })
            : options.app.interrupt(fence)
        ).catch(() => undefined);
      }
    } catch (error) {
      await options.app.interrupt(fence).catch(() => undefined);
      throw error;
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  };
}
