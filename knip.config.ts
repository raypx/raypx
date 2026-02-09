import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "packages/auth": {
      entry: [
        "src/index.ts",
        "src/server.ts",
        "src/middleware.ts",
        "src/envs.ts",
        "src/client/index.ts",
      ],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/config": {
      entry: ["src/index.ts", "src/server.ts", "src/envs.ts"],
      project: ["src/**/*.{ts}"],
    },
    "packages/database": {
      entry: ["src/index.ts", "seed.ts"],
      project: ["src/**/*.{ts}", "config/**/*.{ts}", "seed.ts"],
    },
    "packages/analytics": {
      entry: ["src/index.ts"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/core": {
      entry: ["src/index.ts", "src/config.ts", "src/vite.ts"],
      project: ["src/**/*.{ts}"],
    },
    "packages/email": {
      entry: ["src/index.ts"],
      project: ["src/**/*.{ts}"],
    },
    "packages/email-templates": {
      entry: ["src/index.ts"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/observability": {
      entry: ["src/index.ts"],
      project: ["src/**/*.{ts}"],
    },
    "packages/redis": {
      entry: ["src/index.ts"],
      project: ["src/**/*.{ts}"],
    },
    "packages/shared": {
      entry: ["src/index.ts"],
      project: ["src/**/*.{ts}"],
    },
    "packages/storage": {
      entry: ["src/index.ts"],
      project: ["src/**/*.{ts}"],
    },
    "packages/api": {
      entry: ["src/index.ts"],
      project: ["src/**/*.{ts}"],
    },
    "packages/ui": {
      entry: ["src/**/*.{ts,tsx}"],
      project: ["src/**/*.{ts,tsx}"],
    },
  },
  ignore: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.turbo/**",
    "**/.next/**",
    "**/.tanstack/**",
    "**/.nitro/**",
    "**/.output/**",
    "**/coverage/**",
    "**/*.test.{ts,tsx}",
    "**/*.spec.{ts,tsx}",
    "**/routeTree.gen.ts",
    "**/vite-env.d.ts",
    "**/*.config.{ts,js}",
    "**/vitest.config.{ts,js}",
    "**/migrations/**",
  ],
  ignoreDependencies: ["@types/*", "@vitejs/*", "@dotenvx/dotenvx"],
};

export default config;
