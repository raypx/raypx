import { definePlugin } from "nitro";
import { readWebIndex } from "./app.js";
import { closeApiRuntime, getApiRuntime } from "./runtime.js";
export default definePlugin(async (nitroApp) => {
  await getApiRuntime(readWebIndex);
  nitroApp.hooks.hook("close", closeApiRuntime);
});
