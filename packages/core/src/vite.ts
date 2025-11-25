import type { PluginOption } from "vite";
import type { Config } from "./config";
import VirtualModule from "./vite/virtual-module";

const VIRTUAL_MODULE_ID = "virtual:@raypx/core/env";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

const virtual = {
  serverBuild: VirtualModule.create("server-build"),
  serverManifest: VirtualModule.create("server-manifest"),
  browserManifest: VirtualModule.create("browser-manifest"),
};

export function raypxVitePlugin<Env>(config: Config<Env>): PluginOption {
  return {
    name: "@raypx/vite-plugin",
    enforce: "pre",
    async configResolved(viteConfig) {
      //
      // console.log(config);
      // console.log(viteConfig);
    },
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID || id === "@raypx/core/env") {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
      return null;
    },
    async load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
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
    configureServer(server) {
      //
      // console.log(server);
    },
  };
}

export default raypxVitePlugin;
