import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (viteConfig) => {
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    const { mergeConfig } = await import("vite");
    return mergeConfig(viteConfig, {
      plugins: [tailwindcss()],
    });
  },
};

export default config;
