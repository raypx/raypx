import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

/** Keep Start's dotenv behavior without reporting every inherited CI/tool variable
 * as a build dependency. Existing inherited values already live in process.env. */
export function startEnvironment<T>(
  plugins: T,
  loadEnv: (mode: string, root: string, prefixes: string[]) => Record<string, string>,
): T {
  let replaced = false;
  function visit(value: unknown) {
    if (Array.isArray(value)) {
      for (const plugin of value) visit(plugin);
      return;
    }
    if (
      !value ||
      typeof value !== "object" ||
      !("name" in value) ||
      value.name !== "tanstack-start-core:load-env"
    )
      return;
    const plugin = value as { configResolved?: (config: { root: string; mode: string }) => void };
    plugin.configResolved = ({ root, mode }) => {
      const prefixes = new Set(["VITE_"]);
      for (const name of [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`]) {
        const file = join(root, name);
        if (existsSync(file))
          for (const key of Object.keys(parseEnv(readFileSync(file, "utf8")))) prefixes.add(key);
      }
      Object.assign(process.env, loadEnv(mode, root, [...prefixes]));
    };
    replaced = true;
  }
  visit(plugins);
  if (!replaced)
    throw new Error("TanStack Start environment plugin changed; review scoped dotenv tracking");
  return plugins;
}
