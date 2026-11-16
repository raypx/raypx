import { PublicAddressConfigurationError } from "../public-address.js";
import { MigrationError } from "@raypx/database";
import { definePlugin } from "nitro";
import { closeBackendRuntime, getBackendRuntime } from "./backend.js";
import { beginRequestDrain } from "./draining.js";

export default definePlugin(async (nitroApp) => {
  let runtime: Awaited<ReturnType<typeof getBackendRuntime>>;
  try {
    runtime = await getBackendRuntime();
  } catch (error) {
    // Nitro traps rejected plugin promises; explicitly stop this failed startup.
    console.error(
      error instanceof PublicAddressConfigurationError || error instanceof MigrationError
        ? error.message
        : "Backend startup failed. Check runtime role, configuration, database availability and migrations.",
    );
    process.exit(1);
  }
  const stopClaiming = () => {
    beginRequestDrain();
    if ("stopClaiming" in runtime) runtime.stopClaiming();
    if ("drainStreams" in runtime) void runtime.drainStreams().catch(() => {});
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
