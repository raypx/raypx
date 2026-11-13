import { definePlugin } from "nitro";
import { closeBackendRuntime, getBackendRuntime } from "./backend.js";

export default definePlugin(async (nitroApp) => {
  try {
    await getBackendRuntime();
  } catch {
    // Nitro traps rejected plugin promises; explicitly stop this failed startup.
    console.error(
      "Backend startup failed. Check runtime role, configuration, database availability and migrations.",
    );
    process.exit(1);
  }
  nitroApp.hooks.hook("close", closeBackendRuntime);
});
