import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discover, type Kind, type Target, targets } from "./workspaces.js";

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
        "bun --bun vp test --run --passWithNoTests --exclude '**/*.component.test.{ts,tsx}' --exclude '**/*.integration.test.{ts,tsx}'",
      "test:integration": "bun --bun vp test --run --passWithNoTests integration.test",
      "test:component": "bun --bun vp test --run --passWithNoTests component.test",
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
      "@voidmix/tsconfig": "catalog:dev",
      ...(options.target === "bun" ? { "@types/bun": "catalog:dev" } : {}),
    },
  };
  const config =
    options.target === "browser" || options.target === "native"
      ? "react-library"
      : options.target === "universal"
        ? "library"
        : "node";
  const files: Record<string, string> = {
    "package.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "tsconfig.json": `${JSON.stringify({ extends: `@voidmix/tsconfig/${config}.json`, compilerOptions: { ...(options.target === "universal" ? { lib: ["ES2022"], types: [] } : {}), ...(options.target === "bun" ? { types: ["bun"] } : {}) }, include: ["src/**/*.ts", "src/**/*.tsx"] }, null, 2)}\n`,
    "src/index.ts": "export {};\n",
    "AGENTS.md": `# ${packageName}\n\n## Purpose\n\n${options.target} ${options.kind}; describe its responsibility before adding behavior.\n\n## Interface\n\nPublic exports are declared in package.json.\n\n## Constraints\n\nUse public workspace entries and keep dependencies acyclic.\n\n## Verification\n\nRun bun run --cwd ${directory} check${options.tests ? " and test" : ""}.\n`,
    ...(options.tests
      ? {
          "vitest.config.ts":
            'import { workspaceTests } from "../../test.config";\n\nexport default workspaceTests();\n',
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
      writeFileSync(absolute, content, { flag: "wx" });
    }
  } catch (error) {
    rmSync(join(root, directory), { recursive: true, force: true });
    throw error;
  }
  return paths;
}
