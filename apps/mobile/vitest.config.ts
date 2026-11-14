import { defineConfig, mergeConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import defaults from "../../test.config.js";

function local(path: string) {
  return fileURLToPath(new URL(path, import.meta.url));
}

export default mergeConfig(
  defaults,
  defineConfig({
    ssr: {
      // The CommonJS builds use native require(), which bypasses Vite aliases.
      // Process these real renderer dependencies using their Metro-facing ESM/TS
      // entries so all native imports reach the host mocks below.
      noExternal: [
        "react-native-marked",
        "@jsamr/react-native-li",
        "react-native-reanimated-table",
      ],
      resolve: { mainFields: ["react-native", "module", "main"] },
    },
    resolve: {
      // Shared sources and the test renderer must use Expo's exact React version.
      alias: [
        { find: /^expo-clipboard$/, replacement: local("./tests/mocks/clipboard.ts") },
        { find: /^react$/, replacement: local("./node_modules/react/index.js") },
        {
          find: /^react\/(jsx-runtime|jsx-dev-runtime)$/,
          replacement: local("./node_modules/react/$1.js"),
        },
        { find: /^react-native$/, replacement: local("./tests/mocks/react-native.tsx") },
        { find: /^react-native-svg$/, replacement: local("./tests/mocks/react-native-svg.tsx") },
        { find: /^heroui-native\/.+$/, replacement: local("./tests/mocks/heroui.tsx") },
        {
          find: /^react-native-safe-area-context$/,
          replacement: local("./tests/mocks/safe-area.tsx"),
        },
        { find: /^uniwind$/, replacement: local("./tests/mocks/uniwind.ts") },
        { find: /^expo-localization$/, replacement: local("./tests/mocks/localization.ts") },
      ],
    },
    test: {
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      setupFiles: [local("./tests/setup.ts")],
    },
  }),
);
