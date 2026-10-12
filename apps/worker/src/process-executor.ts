import { fork } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CloudApplication } from "@voidmix/application";
import type { CloudLimits, CloudRun } from "@voidmix/core";
import type { RendererOptions } from "./tools/render.js";

export interface RunnerBootstrap {
  run: CloudRun;
  epoch: number;
  ownerId: string;
  credential: string;
  gatewayUrl: string;
  limits: CloudLimits;
  renderer: Omit<RendererOptions, "directory" | "signal">;
  delegationEnabled: boolean;
  exportEnabled: boolean;
}
export function runnerEnvironment(): NodeJS.ProcessEnv {
  return { NODE_ENV: "production", PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC" };
}
export function createProcessExecutor(options: {
  app: CloudApplication;
  ownerId: string;
  gatewayUrl: string;
  limits: CloudLimits;
  renderer: RunnerBootstrap["renderer"];
  delegationEnabled: boolean;
  exportEnabled: boolean;
  runnerEntry?: string;
  onError?: (error: unknown, runId: string) => void;
}) {
  return async (runId: string, signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) return;
    const claimed = await options.app.claim({ runId, ownerId: options.ownerId });
    if (!claimed) return;
    const fence = { runId, ownerId: options.ownerId, epoch: claimed.epoch };
    const grantId = crypto.randomUUID(),
      token = randomBytes(32).toString("base64url");
    const child = fork(
      options.runnerEntry ?? fileURLToPath(new URL("./runner.mjs", import.meta.url)),
      [],
      {
        env: runnerEnvironment(),
        execArgv: [],
        serialization: "advanced",
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      },
    );
    let stopping = false,
      renewal = false,
      finished = false;
    const exited = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => resolve());
    });
    void exited.catch(() => undefined);
    child.on("message", (message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "done"
      )
        finished = true;
    });
    let killTimer: NodeJS.Timeout | undefined;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      if (child.connected) child.send({ type: "abort" });
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      killTimer.unref();
    };
    signal?.addEventListener("abort", stop, { once: true });
    const renew = async () => {
      if (renewal || stopping || finished) return;
      renewal = true;
      try {
        const run = await options.app.heartbeat(fence);
        await options.app.renewExecutionGrant({
          ...fence,
          grantId,
          expiresAt: run.leaseExpiresAt!,
        });
      } catch (error) {
        options.onError?.(error, runId);
        stop();
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
        actions: ["bootstrap", "invoke", "model", "research", "object"],
      });
      if (signal?.aborted) stop();
      child.send({
        type: "start",
        bootstrap: {
          run: claimed.run,
          epoch: claimed.epoch,
          ownerId: options.ownerId,
          credential: `${grantId}.${token}`,
          gatewayUrl: options.gatewayUrl,
          limits: options.limits,
          renderer: options.renderer,
          delegationEnabled: options.delegationEnabled,
          exportEnabled: options.exportEnabled,
        } satisfies RunnerBootstrap,
      });
      await exited;
    } finally {
      clearInterval(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", stop);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await options.app.revokeExecutionGrant({ grantId }).catch(() => undefined);
      // A terminal Run is protected; only an unfinished current owner can be interrupted.
      await options.app.interrupt(fence).catch(() => undefined);
    }
  };
}
