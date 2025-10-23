import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreDependencies: ["@turbo/gen", "@commitlint/cli", "type-fest"],
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
      entry: ["src/**/*.{ts,tsx,js}", "src/env.ts"],
      project: ["src/**/*.{ts,tsx}"],
      ignoreDependencies: ["tw-animate-css"],
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
      ignoreDependencies: ["tailwindcss", "tw-animate-css", "@hookform/resolvers"],
    },
    "tooling/tsconfig": {
      entry: [],
      project: ["*.json"],
    },
    "packages/db": {
      entry: ["seed.ts"],
    },
    "packages/email": {},
    scripts: {
      entry: ["cmd/*.ts", "cli.ts"],
    },
  },
};

export default config;
