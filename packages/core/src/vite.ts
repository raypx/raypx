import type { PluginOption } from "vite";
import type { Config } from "./config.ts";
import VirtualModule from "./vite/virtual-module.ts";

const virtual = {
  runtimeEnv: VirtualModule.create("runtime-env"),
};

export function raypxVitePlugin<Env>(_config: Config<Env>): PluginOption {
  return {
    name: "@raypx/vite-plugin",
    enforce: "pre",
    resolveId(id) {
      if (id === virtual.runtimeEnv.id) {
        return virtual.runtimeEnv.resolvedId;
      }
      return null;
    },
    async load(id) {
      if (id === virtual.runtimeEnv.resolvedId) {
        return `export const runtimeEnv = ${JSON.stringify({})}`;
        // try {
        //   const content = await readFile(envJsPath, "utf-8");
        //   return content;
        // } catch {
        //   throw new Error(
        //     `[@raypx/vite-plugin] Failed to load env config from ${envJsPath}. Make sure the config is built first.`,
        //   );
        // }
      }
      return null;
    },
  };
}

export default raypxVitePlugin;
