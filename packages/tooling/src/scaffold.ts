import { constants, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { targets, type Kind, type Target } from "@raypx-kit/devkit/workspaces";
import { discover } from "./repository.js";
import { workspaceInstructions } from "./templates/workspace/agents.js";

export interface ScaffoldOptions {
  kind: Kind;
  target: Target;
  write?: boolean;
  tests?: boolean;
}

export function scaffold(root: string, name: string, options: ScaffoldOptions): string[] {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name))
    throw new Error("Use a lowercase hyphenated workspace name");
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name))
    throw new Error("Workspace name is reserved on Windows");
  if (!["library", "app", "tooling"].includes(options.kind) || !targets.includes(options.target))
    throw new Error("Invalid workspace kind or target");
  const folder = options.kind === "app" ? "apps" : "packages";
  const directory = `${folder}/${name}`;
  const packageName = options.kind === "app" ? name : `@raypx/${name}`;
  if (existsSync(join(root, directory)) || discover(root).byName.has(packageName))
    throw new Error(`Workspace already exists: ${directory}`);
  const scripts: Record<string, string> = {
    check: "bun --check --tsconfig-override tsconfig.json",
  };
  if (options.tests)
    Object.assign(scripts, {
      test: "bun --bun vp test --run --passWithNoTests",
      "test:unit":
        "bun --bun vp test --run --passWithNoTests --exclude '**/component/**' --exclude '**/integration/**'",
      "test:integration": "bun --bun vp test --run --passWithNoTests integration/",
      "test:component": "bun --bun vp test --run --passWithNoTests component/",
    });
  const manifest = {
    name: packageName,
    version: "0.0.0",
    private: true,
    type: "module",
    raypx: { kind: options.kind, target: options.target },
    ...(options.kind !== "app" ? { exports: { ".": "./src/index.ts" } } : {}),
    scripts,
    devDependencies: {
      "@raypx-kit/tsconfig": "catalog:dev",
      "@raypx/tooling": "workspace:*",
      ...(options.target === "bun" ? { "@types/bun": "catalog:dev" } : {}),
    },
  };
  const config =
    options.target === "browser" || options.target === "native"
      ? "react-library"
      : options.target === "universal"
        ? "library"
        : "node";
  const tsconfig = {
    extends: `@raypx-kit/tsconfig/${config}.json`,
    compilerOptions: {
      ...(options.target === "universal" ? { lib: ["ES2022"], types: [] } : {}),
      ...(options.target === "bun" ? { types: ["bun"] } : {}),
    },
    include: [
      "src/**/*.ts",
      "src/**/*.tsx",
      ...(options.tests ? ["tests/**/*.ts", "tests/**/*.tsx"] : []),
    ],
  };
  const files: Record<string, string | URL> = {
    "package.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "tsconfig.json": `${JSON.stringify(tsconfig, null, 2)}\n`,
    "src/index.ts": "export {};\n",
    "AGENTS.md": workspaceInstructions({
      packageName,
      directory,
      kind: options.kind,
      target: options.target,
      tests: Boolean(options.tests),
    }),
    "vite.config.ts":
      'import { workspaceTaskConfig } from "@raypx/tooling/tasks";\n\nexport default workspaceTaskConfig(import.meta.url);\n',
    ...(options.tests
      ? {
          "vitest.config.ts": new URL("./templates/workspace/vitest.mjs", import.meta.url),
        }
      : {}),
  };
  const paths = Object.keys(files).map((file) => `${directory}/${file}`);
  if (!options.write) return paths;
  // Exclusive mkdir prevents concurrent generators from overwriting each other.
  mkdirSync(join(root, directory));
  try {
    for (const [file, content] of Object.entries(files)) {
      const absolute = join(root, directory, file);
      mkdirSync(join(absolute, ".."), { recursive: true });
      if (typeof content === "string") writeFileSync(absolute, content, { flag: "wx" });
      else copyFileSync(content, absolute, constants.COPYFILE_EXCL);
    }
  } catch (error) {
    rmSync(join(root, directory), { recursive: true, force: true });
    throw error;
  }
  return paths;
}
