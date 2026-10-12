import { createCloudPiAgent, checkPiRuntime } from "@raypx/ai";
import { createCloudExecutor } from "./cloud.js";
import { createExecutionClient } from "./execution-client.js";
import type { RunnerBootstrap } from "./process-executor.js";
import { executionBootstrapSchema } from "@raypx/contracts/execution-gateway";

const controller = new AbortController();
if (process.argv.includes("--check")) {
  await checkPiRuntime();
  process.stdout.write("Raypx isolated Bun Runner runtime verified.\n");
} else serve();
function serve() {
  let started = false;
  process.on("disconnect", () => controller.abort("interrupted"));
  process.on("SIGTERM", () => controller.abort("interrupted"));
  process.on("message", (message: { type: string; bootstrap?: RunnerBootstrap }) => {
    if (message.type === "abort") controller.abort("interrupted");
    if (message.type !== "start" || started || !message.bootstrap) return;
    started = true;
    void run(message.bootstrap).then(
      () => {
        process.send?.({ type: "done" });
        process.disconnect();
      },
      () => {
        process.exitCode = 1;
        process.disconnect();
      },
    );
  });
}
async function run(bootstrap: RunnerBootstrap) {
  const gateway = createExecutionClient(bootstrap.gatewayUrl, bootstrap.credential);
  const configuration = executionBootstrapSchema.parse(await gateway.client.bootstrap({}));
  const model = configuration.model;
  const executor = createCloudExecutor({
    app: gateway.app,
    agent: null,
    ...(model
      ? {
          agentForExecution: (executionId: string) =>
            createCloudPiAgent({
              model,
              transport: (request, signal) =>
                gateway.client.model({ ...request, executionId }, { signal }),
            }),
        }
      : {}),
    storage: gateway.storage,
    research: gateway.research,
    ownerId: bootstrap.ownerId,
    claimed: { run: bootstrap.run, epoch: bootstrap.epoch },
    history: configuration.history,
    parentOwnsLease: true,
    limits: bootstrap.limits,
    renderer: bootstrap.renderer,
    delegationEnabled: bootstrap.delegationEnabled,
    exportEnabled: bootstrap.exportEnabled,
  });
  await executor(bootstrap.run.id, controller.signal);
}
