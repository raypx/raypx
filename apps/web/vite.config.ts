import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  ssr: {
    noExternal: ["@tabler/icons-react"],
  },
  plugins: [tsconfigPaths(), tailwindcss(), tanstackStart(), viteReact(), nitro()],
});
