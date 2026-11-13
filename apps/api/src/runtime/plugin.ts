import { definePlugin } from "nitro";
import { closeBackendRuntime, getBackendRuntime } from "./backend.js";

export default definePlugin(async (nitroApp) => {
  let runtime: Awaited<ReturnType<typeof getBackendRuntime>>;
  try {
    runtime = await getBackendRuntime();
  } catch {
    // Nitro traps rejected plugin promises; explicitly stop this failed startup.
    console.error(
      "Backend startup failed. Check runtime role, configuration, database availability and migrations.",
    );
    process.exit(1);
  }
  const stopClaiming = () => {
    if ("stopClaiming" in runtime) runtime.stopClaiming();
  };
  // srvx owns listener shutdown and drains requests before Nitro's close hook.
  // Stop ownership acquisition first without interrupting those requests.
  process.prependListener("SIGTERM", stopClaiming);
  process.prependListener("SIGINT", stopClaiming);
  nitroApp.hooks.hook("close", async () => {
    process.off("SIGTERM", stopClaiming);
    process.off("SIGINT", stopClaiming);
    stopClaiming();
    await closeBackendRuntime();
  });
});
