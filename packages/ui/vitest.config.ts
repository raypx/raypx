import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "vite-plus/test/browser-playwright";
import { defineConfig } from "vite-plus";

// Browser story tests are opt-in, separate from the fast jsdom unit project.
// Storybook 10.6 loads preview annotations and accessibility hooks itself.
export default defineConfig({
  // Browser tests must compile the same utility styles as the Storybook Canvas.
  plugins: [tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: fileURLToPath(new URL("./.storybook", import.meta.url)),
            storybookUrl: "http://127.0.0.1:6006",
          }),
        ],
        test: {
          name: "ui-storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
