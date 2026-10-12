import { logger } from "@voidmix/shared/logger";
import { definePlugin } from "nitro";

import { closeApiRuntime, getApiRuntime } from "./runtime.js";

export default definePlugin(async (nitroApp) => {
  await getApiRuntime();
  const started = logger({ operation: "api.started" });
  started.set({ runtime: "nitro", outcome: "success" });
  started.emit();

  nitroApp.hooks.hook("close", async () => {
    const stopping = logger({ operation: "api.stopping" });
    stopping.set({ runtime: "nitro", outcome: "started" });
    try {
      await closeApiRuntime();
      stopping.set({ outcome: "success" });
    } catch (error) {
      stopping.error(error instanceof Error ? error : String(error));
      throw error;
    } finally {
      stopping.emit();
    }
  });
});
