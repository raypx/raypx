/// <reference types="@vitejs/devtools-kit" />
import type { Plugin } from "vite";
import { readFileSync } from "node:fs";

export function raypxDevtools(): Plugin {
  const mark = readFileSync(new URL(import.meta.resolve("@raypx/ui/logo-mark.webp")));
  return {
    name: "raypx:devtools",
    apply: "serve",
    config: () => ({
      // Both the application bridge and the Dock renderer must share one module instance.
      optimizeDeps: { exclude: ["@raypx/devtools"] },
    }),
    devtools: {
      setup(context) {
        context.docks.register({
          id: "raypx:page-state",
          title: "Raypx",
          icon: `data:image/webp;base64,${mark.toString("base64")}`,
          type: "custom-render",
          renderer: { importFrom: "@raypx/devtools/renderer", importName: "default" },
        });
      },
    },
  };
}
