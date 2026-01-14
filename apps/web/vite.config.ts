import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import packageJson from "./package.json";

export default defineConfig({
  ssr: {
    noExternal: ["@tabler/icons-react"],
  },
  optimizeDeps: {
    exclude: ["@raypx/ui"],
  },
  define: {
    "import.meta.env.PACKAGE_VERSION": JSON.stringify(packageJson.version),
  },
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    viteReact({
      babel: {
        plugins: [
          [
            "babel-plugin-react-compiler",
            {
              target: "19",
            },
          ],
        ],
      },
    }),
    tailwindcss(),
    nitro(),
  ],
});
