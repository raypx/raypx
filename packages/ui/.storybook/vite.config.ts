import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

// Storybook owns its browser build; do not load the workspace's task/test config.
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: { include: ["storybook/theming", "@storybook/addon-docs/blocks"] },
});
