import { getDefaultConfig } from "expo/metro-config";
import { mkdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { withUniwindConfig } from "uniwind/metro";

const directory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const defaults = getDefaultConfig(directory);
const packagesRoot = resolve(directory, "../../packages") + sep;

const config = {
  ...defaults,
  resolver: {
    ...defaults.resolver,
    // Shared ESM packages spell emitted imports as .js. Resolve their relative
    // imports to TypeScript source, as Bun and Vite already do.
    resolveRequest(context, moduleName, platform) {
      const workspaceSource =
        context.originModulePath.startsWith(packagesRoot) &&
        !context.originModulePath.includes(`${sep}node_modules${sep}`);
      const request =
        workspaceSource && moduleName.startsWith(".") && moduleName.endsWith(".js")
          ? moduleName.slice(0, -3)
          : moduleName;
      return context.resolveRequest(context, request, platform);
    },
  },
} satisfies typeof defaults;

// Expo export does not create its dev cache directory on a clean checkout.
mkdirSync(resolve(directory, ".expo"), { recursive: true });
export default withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: resolve(directory, ".expo/uniwind.d.ts"),
  polyfills: { rem: 16 },
});
