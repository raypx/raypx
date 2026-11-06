import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  core: { disableTelemetry: true },
  // Storybook owns the Vite config; add only what the shared UI styles need.
  viteFinal(viteConfig) {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    // A `bun link`ed library resolves its own React copy; keep singleton peers unique.
    viteConfig.resolve = { ...viteConfig.resolve, dedupe: ["react", "react-dom"] };
    viteConfig.build = {
      ...viteConfig.build,
      rolldownOptions: {
        ...viteConfig.build?.rolldownOptions,
        // Base UI marks modules "use client" for RSC; stories render client-side only.
        onLog(level, log, handler) {
          if (log.code !== "MODULE_LEVEL_DIRECTIVE") handler(level, log);
        },
      },
    };
    return viteConfig;
  },
};

export default config;
