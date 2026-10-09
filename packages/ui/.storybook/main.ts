import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const config = {
  stories: ["../stories/**/*.stories.tsx"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: { viteConfigPath: fileURLToPath(new URL("./vite.config.ts", import.meta.url)) },
    },
  },
  core: { disableTelemetry: true },
  typescript: { reactDocgen: "react-docgen-typescript" },
} satisfies StorybookConfig;

export default config;
