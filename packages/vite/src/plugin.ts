import type { Plugin } from "vite";

function vitePlugin(): Plugin {
  return {
    name: "@raypx/vite-plugin",
    enforce: "pre",
  };
}

export default vitePlugin;
