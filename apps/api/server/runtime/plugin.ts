import { definePlugin } from "nitro";
import { closeApiRuntime, getApiRuntime } from "./server.js";

export default definePlugin(async (nitroApp) => {
  try {
    await getApiRuntime();
  } catch {
    // Nitro traps rejected plugin promises; explicitly stop this failed startup.
    console.error(
      "API startup failed. Check runtime configuration, database availability and migrations.",
    );
    process.exit(1);
  }
  nitroApp.hooks.hook("close", closeApiRuntime);
});
