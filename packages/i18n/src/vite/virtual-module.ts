import type { Plugin } from "vite";
import { virtualIds } from "./constants";

/**
 * Create virtual module content for i18n
 * Maps @raypx/i18n/* imports to the compiled paraglide output
 */
export function createVirtualModule(rootDir: string, file: string, exports = "*"): string {
  const exportStatement =
    exports === "*"
      ? `export * from "${rootDir}/${file}";`
      : `export { ${exports} } from "${rootDir}/${file}";`;

  return `import "urlpattern-polyfill";\n${exportStatement}`;
}

/**
 * Create Vite plugin for virtual i18n modules
 */
export function createVirtualModulePlugin(outDir: string): Plugin {
  const virtualModules: Record<string, string> = {
    "\0@raypx/i18n/messages": createVirtualModule(outDir, "messages.js"),
    "\0@raypx/i18n/runtime": createVirtualModule(outDir, "runtime.js"),
    "\0@raypx/i18n/server": createVirtualModule(outDir, "server.js"),
  };

  return {
    name: "@raypx/i18n-plugin",
    enforce: "pre",
    resolveId(id) {
      if (virtualIds.has(id)) return `\0${id}`;
      return null;
    },
    load(id) {
      return virtualModules[id] ?? null;
    },
  };
}
