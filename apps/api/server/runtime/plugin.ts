import { definePlugin } from "nitro";
import { closeApiRuntime, getApiRuntime } from "./node.js";

export default definePlugin(async (nitroApp) => {
  await getApiRuntime();
  nitroApp.hooks.hook("close", closeApiRuntime);
});
