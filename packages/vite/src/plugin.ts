import { compileParaglide } from "@raypx/i18n/server";
import type { Plugin } from "vite";

function vitePlugin(): Plugin {
  return {
    name: "@raypx/vite-plugin",
    enforce: "pre",
    configureServer: async () => {
      await compileParaglide();
      console.log("configureServer");
    },
  } satisfies Plugin;
}

export default vitePlugin;
