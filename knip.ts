import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { KnipConfig } from "knip";

function exportsToSources(directory: string): string[] {
  const manifest = JSON.parse(
    readFileSync(new URL(`${directory}/package.json`, import.meta.url), "utf8"),
  ) as { exports?: unknown; bin?: unknown };
  const targets = new Set<string>();
  function visit(value: unknown): void {
    if (typeof value === "string") {
      const source = value.replace(/^\.\//, "").replace(/^dist\//, "src/");
      if (/\.[cm]?[jt]sx?$/.test(source))
        targets.add(
          source.replace(/(?:\.d)?\.[cm]?js$/, ".{ts,tsx}").replace(/\.d\.ts$/, ".{ts,tsx}"),
        );
    } else if (value && typeof value === "object") {
      for (const [condition, target] of Object.entries(value))
        if (condition !== "shadcn") visit(target);
    }
  }
  visit(manifest.exports);
  visit(manifest.bin);
  return [...targets];
}

type Configuration = Exclude<KnipConfig, (...args: never[]) => unknown>;
const workspaces: NonNullable<Configuration["workspaces"]> = {
  ".": {
    // Bootstrap CLIs and the database probe run as subprocesses; legacy entries remain supported.
    entry: [
      "scripts/install-hooks.ts",
      "scripts/doctor.ts",
      "scripts/doctor-database.ts",
      "scripts/setup.ts",
      "scripts/check-consumer.ts",
      "scripts/test-consumer-browser.ts",
      "scripts/test/**/*.test.ts",
      "scripts/browser/**/*.spec.ts",
      "playwright.consumer.config.ts",
    ],
    project: ["scripts/**/*.ts", "*.ts"],
    // install-hooks addresses the Vite+ binary by filesystem path.
    ignoreDependencies: ["vp"],
  },
  "apps/web": {
    entry: [
      "src/router.tsx",
      "src/routes/**/*.{ts,tsx}",
      "server/plugins/runtime.ts",
      "test/**/*.test.ts",
      "playwright.config.ts",
      "e2e/**/*.spec.ts",
    ],
    project: [
      "src/**/*.{ts,tsx}",
      "!src/routeTree.gen.ts",
      "server/**/*.ts",
      "test/**/*.ts",
      "e2e/**/*.ts",
      "*.ts",
    ],
    // CSS @imports are compiled by the Tailwind Vite plugin, outside TS imports.
    ignoreDependencies: ["tailwindcss", "tw-animate-css"],
  },
};
for (const entry of readdirSync(new URL("./packages", import.meta.url), { withFileTypes: true })) {
  if (
    !entry.isDirectory() ||
    !existsSync(new URL(`./packages/${entry.name}/package.json`, import.meta.url))
  )
    continue;
  const directory = join("packages", entry.name);
  workspaces[directory] = {
    entry: [...exportsToSources(directory), "test/**/*.{test,spec}.{ts,tsx}"],
    project: ["src/**/*.{ts,tsx}", "test/**/*.{ts,tsx}", "*.ts"],
    // Vite+ owns the aliased Vite runtime; it is an explicit toolchain peer.
    ignoreDependencies: entry.name === "logger" || entry.name === "ui" ? [] : ["vite"],
  };
}
workspaces["packages/config"] = {
  ...workspaces["packages/config"],
  entry: ["test/**/*.test.ts", "src/styles.ts"],
  // styles.ts is executed by packageConfig's task strings, not static imports.
};
workspaces["packages/env"] = {
  ...workspaces["packages/env"],
  entry: [...exportsToSources("packages/env"), "test/**/*.test.ts", "src/cli.ts"],
  // The root check:runtime-env task invokes this source CLI before any build.
};
workspaces["packages/db"] = {
  ...workspaces["packages/db"],
  entry: [...exportsToSources("packages/db"), "test/**/*.test.ts", "src/cli.ts"],
  // The root db:migrate task invokes this source CLI explicitly.
};
workspaces["packages/ui"] = {
  ...workspaces["packages/ui"],
  entry: [
    ...exportsToSources("packages/ui"),
    ".storybook/*.{ts,tsx}",
    "stories/**/*.stories.tsx",
    "test/**/*.test.tsx",
  ],
  project: [
    "src/**/*.{ts,tsx}",
    "test/**/*.{ts,tsx}",
    "stories/**/*.tsx",
    ".storybook/*.{ts,tsx}",
    "*.ts",
  ],
  ignoreDependencies: ["tailwindcss", "tw-animate-css"],
};
workspaces["packages/client"] = {
  ...workspaces["packages/client"],
  entry: [
    ...exportsToSources("packages/client"),
    "test/**/*.{test,spec}.{ts,tsx}",
    "test/fixtures/core-entry.ts",
  ],
  // A real Bun browser bundle invokes this fixture using a generated script.
};
export default {
  workspaces,
  // Both public logger spellings are compatibility exports of the same instance.
  ignoreIssues: { "packages/logger/src/index.ts": ["duplicates"] },
} satisfies KnipConfig;
