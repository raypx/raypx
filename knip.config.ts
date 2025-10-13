import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreDependencies: ["@turbo/gen", "@commitlint/cli"],
  ignoreBinaries: ["only-allow"],
  ignore: ["turbo/generators/**", "**/*.css", "**/envs.ts"],
  ignoreExportsUsedInFile: true,
  drizzle: true,
  workspaces: {
    ".": {
      entry: ["*.config.{js,ts,mjs}", "turbo.json"],
      ignore: [
        "**/*.d.ts",
        "**/dist/**",
        "**/out/**",
        "**/.turbo/**",
        "**/.webpack/**",
        "**/coverage/**",
        "**/build/**",
        "**/node_modules/**",
        "**/*.min.js",
        "**/i18n/request.ts",
      ],
    },
    "apps/web": {
      entry: ["src/**/*.{ts,tsx}", "src/env.ts"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "apps/docs": {
      entry: ["source.config.ts"],
      project: ["**/*.{ts,tsx,mdx,js,mjs}"],
      ignore: ["env.ts", "lib/source.ts"],
    },
    "packages/auth": {
      entry: [],
      project: ["src/**/*.{ts,tsx}"],
      ignore: ["envs.ts", "src/permissions.ts"],
    },
    "packages/ui": {
      entry: [],
      project: ["src/**/*.{ts,tsx}"],
      ignoreDependencies: ["tailwindcss", "tw-animate-css", "date-fns", "@hookform/resolvers"],
    },
    "tooling/tsconfig": {
      entry: [],
      project: ["*.json"],
    },
    "packages/db": {
      entry: ["seed.ts"],
    },
    "packages/email": {
      ignoreDependencies: ["@react-email/preview-server"],
    },
    "tooling/scripts": {
      entry: [],
    },
  },
};

export default config;
