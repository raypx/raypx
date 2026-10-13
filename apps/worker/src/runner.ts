import type { RunnerBootstrap } from "./process-executor.js";

type RunnerMessage =
  | { type: "start"; bootstrap: RunnerBootstrap }
  | { type: "abort"; reason?: "budget_exceeded" | "interrupted" };

/** Task mode installs IPC before loading the Agent or adapters; Host waits for readiness. */
export async function startRunner(): Promise<void> {
  if (process.argv.includes("--check")) {
    const { checkPiRuntime } = await import("@raypx/ai");
    await checkPiRuntime();
    process.stdout.write("Raypx isolated Bun Runner runtime verified.\n");
    return;
  }
  if (!process.connected || !process.send)
    throw new Error("Runner mode requires a Host IPC connection.");

  const controller = new AbortController();
  await new Promise<void>((resolve) => {
    let started = false;
    let settled = false;
    const finish = (failed: boolean) => {
      if (settled) return;
      settled = true;
      process.off("message", receive);
      process.off("disconnect", stop);
      process.off("SIGTERM", stop);
      if (failed) process.exitCode = 1;
      if (process.connected) {
        if (!failed && started) process.send?.({ type: "done" });
        process.disconnect();
      }
      resolve();
    };
    const stop = () => {
      controller.abort("interrupted");
      if (!started) finish(false);
    };
    const receive = (message: RunnerMessage) => {
      if (message.type === "abort") {
        controller.abort(message.reason === "budget_exceeded" ? "budget_exceeded" : "interrupted");
        if (!started) finish(false);
      } else if (message.type === "start" && !started) {
        started = true;
        void run(message.bootstrap, controller.signal).then(
          () => finish(false),
          () => finish(true),
        );
      }
    };
    process.on("disconnect", stop);
    process.on("SIGTERM", stop);
    process.on("message", receive);
    process.send?.({ type: "ready" });
  });
}

async function run(bootstrap: RunnerBootstrap, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const [{ createExecutionClient }, { executionBootstrapSchema }] = await Promise.all([
    import("./execution-client.js"),
    import("@raypx/contracts/execution-gateway"),
  ]);
  signal.throwIfAborted();
  const gateway = createExecutionClient(bootstrap.gatewayUrl, bootstrap.credential);
  const configuration = executionBootstrapSchema.parse(
    await gateway.client.bootstrap({}, { signal }),
  );
  signal.throwIfAborted();
  const [{ createCloudExecutor }, { createCloudPiAgent }] = await Promise.all([
    import("./execution.js"),
    import("@raypx/ai"),
  ]);
  signal.throwIfAborted();
  const model = configuration.model;
  const executor = createCloudExecutor({
    app: gateway.app,
    agent: null,
    ...(model
      ? {
          agentForExecution: (executionId: string) =>
            createCloudPiAgent({
              model,
              transport: (request, callSignal) =>
                gateway.client.model({ ...request, executionId }, { signal: callSignal }),
            }),
        }
      : {}),
    storage: gateway.storage,
    research: gateway.research,
    ownerId: bootstrap.ownerId,
    claimed: { run: bootstrap.run, epoch: bootstrap.epoch },
    history: configuration.history,
    directory: bootstrap.directory,
    limits: bootstrap.limits,
    renderer: bootstrap.renderer,
    delegationEnabled: bootstrap.delegationEnabled,
    exportEnabled: bootstrap.exportEnabled,
  });
  await executor(bootstrap.run.id, signal);
}
