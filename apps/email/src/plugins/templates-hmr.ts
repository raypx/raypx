/**
 * Vite plugin for email templates HMR support
 * Watches email template files in @raypx/email-templates package and triggers HMR updates
 */

import { resolve } from "node:path";
import type { HmrContext, ModuleNode, Plugin } from "vite";
import { ModuleCache } from "./cache";
import VirtualModule from "./virtual-module";

const virtual = {
  templates: VirtualModule.create("templates"),
};

/**
 * Check if file is an email template
 */
const isEmailTemplate = (file: string): boolean =>
  file.includes("/packages/email-templates/src/emails/") && file.endsWith(".tsx");

/**
 * Recursively collect all modules that import from a given module
 */
const collectImporters = (mod: ModuleNode, visited = new Set<ModuleNode>()): Set<ModuleNode> => {
  if (visited.has(mod)) return visited;
  visited.add(mod);
  for (const importer of mod.importers) {
    collectImporters(importer, visited);
  }
  return visited;
};

/**
 * Create email templates HMR plugin
 */
export function emailPlugin(): Plugin {
  let emailTemplatesPath: string;
  const cache = new ModuleCache();

  return {
    name: "@raypx/email/plugin",

    async configResolved(config) {
      emailTemplatesPath = resolve(config.root, "../../packages/email-templates/src/emails");
      try {
        await cache.scan(emailTemplatesPath);
      } catch (error) {
        console.error("[email-templates-hmr] Failed to pre-scan templates:", error);
      }
    },

    resolveId(id) {
      if (id === virtual.templates.id) {
        return virtual.templates.resolvedId;
      }
      return null;
    },

    async load(id) {
      if (id === virtual.templates.resolvedId) {
        try {
          const code = await cache.getModuleCode(emailTemplatesPath);
          return code;
        } catch (error) {
          console.error("[email-templates-hmr] Failed to generate templates module:", error);
          return "export const emailModules = {}; export default emailModules;";
        }
      }
      return null;
    },

    configureServer(server) {
      // Watch email templates directory
      server.watcher.add(`${emailTemplatesPath}/**/*.tsx`);

      // Handle file changes, additions, and deletions
      const handleChange = (event: string) => async (file: string) => {
        if (!isEmailTemplate(file)) return;

        // Invalidate cache and rescan
        await cache.invalidate(emailTemplatesPath);

        // Invalidate virtual module
        const mod = server.moduleGraph.getModuleById(virtual.templates.resolvedId);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
        }

        // Send custom HMR event
        server.ws.send({
          type: "custom",
          event: "email-templates-update",
          data: { file, event },
        });
      };

      server.watcher.on("change", handleChange("Changed"));
      server.watcher.on("add", handleChange("Added"));
      server.watcher.on("unlink", handleChange("Deleted"));
    },

    async handleHotUpdate(ctx: HmrContext) {
      const { file, server } = ctx;

      if (!isEmailTemplate(file)) return;

      // Invalidate cache and rescan
      await cache.invalidate(emailTemplatesPath);

      // Find the virtual module
      const virtualModule = server.moduleGraph.getModuleById(virtual.templates.resolvedId);
      if (!virtualModule) return;

      // Collect all affected modules
      const affectedModules = collectImporters(virtualModule);

      // Invalidate all affected modules
      for (const mod of affectedModules) {
        server.moduleGraph.invalidateModule(mod);
      }

      return Array.from(affectedModules);
    },
  };
}
