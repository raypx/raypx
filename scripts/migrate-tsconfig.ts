#!/usr/bin/env bun

/**
 * Migration script: Update all packages to use @raypx/tsconfig
 *
 * This script:
 * 1. Adds @raypx/tsconfig as devDependency to all packages
 * 2. Updates tsconfig.json to extend from @raypx/tsconfig
 * 3. Updates tsconfig.test.json to extend from @raypx/tsconfig/test.json
 * 4. Removes old @raypx/config/tsconfig references
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packagesDir = fileURLToPath(new URL("../packages", import.meta.url));
function writeJSONIfChanged(path: string, value: unknown): void {
  const previous = JSON.parse(readFileSync(path, "utf8"));
  if (JSON.stringify(previous) !== JSON.stringify(value)) {
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  }
}

const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

console.log(`Found ${packages.length} packages to migrate\n`);

for (const pkg of packages) {
  if (pkg === "tsconfig") {
    console.log(`⏭️  Skipping ${pkg} (tsconfig package itself)`);
    continue;
  }

  const packageDir = join(packagesDir, pkg);
  console.log(`\n📦 Migrating ${pkg}...`);

  // 1. Update package.json
  const packageJsonPath = join(packageDir, "package.json");
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    if (!packageJson.devDependencies) {
      packageJson.devDependencies = {};
    }

    // Add @raypx/tsconfig
    packageJson.devDependencies["@raypx/tsconfig"] = "workspace:*";

    // Package task configurations still consume the engineering tools.
    if (pkg !== "config" && existsSync(join(packageDir, "vite.config.ts"))) {
      packageJson.devDependencies["@raypx/config"] = "workspace:*";
    }

    writeJSONIfChanged(packageJsonPath, packageJson);
    console.log("  ✅ Added @raypx/tsconfig dependency");
  } catch (error) {
    throw new Error(`Could not migrate ${packageJsonPath}`, { cause: error });
  }

  // 2. Update tsconfig.json
  const tsconfigPath = join(packageDir, "tsconfig.json");
  try {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));

    // Determine which base config to use
    const isReact = ["hooks", "ui"].includes(pkg);
    const baseConfig =
      pkg === "config"
        ? "./tsconfig.test.json"
        : isReact
          ? "@raypx/tsconfig/react.json"
          : "@raypx/tsconfig/node.json";

    tsconfig.extends = baseConfig;

    if (pkg === "config") {
      if (tsconfig.compilerOptions) {
        tsconfig.compilerOptions.noEmit = true;
        delete tsconfig.compilerOptions.outDir;
        delete tsconfig.compilerOptions.declaration;
      }
    } else {
      tsconfig.compilerOptions ??= {};
      tsconfig.compilerOptions.outDir = "dist";
      tsconfig.compilerOptions.rootDir = "src";
      tsconfig.compilerOptions.declaration = true;
    }

    writeJSONIfChanged(tsconfigPath, tsconfig);
    console.log(`  ✅ Updated tsconfig.json (extends ${baseConfig})`);
  } catch (error) {
    throw new Error(`Could not migrate ${tsconfigPath}`, { cause: error });
  }

  // 3. Update tsconfig.test.json
  const tsconfigTestPath = join(packageDir, "tsconfig.test.json");
  try {
    const oldCheckPath = join(packageDir, "tsconfig.check.json");
    if (!existsSync(tsconfigTestPath) && existsSync(oldCheckPath)) {
      renameSync(oldCheckPath, tsconfigTestPath);
    }
    const tsconfigTest = JSON.parse(readFileSync(tsconfigTestPath, "utf8"));

    tsconfigTest.extends = "@raypx/tsconfig/test.json";

    // Ensure proper includes
    if (!tsconfigTest.include) {
      tsconfigTest.include = ["src/**/*", "test/**/*"];
    }

    writeJSONIfChanged(tsconfigTestPath, tsconfigTest);
    console.log("  ✅ Updated tsconfig.test.json");
  } catch (error) {
    throw new Error(`Could not migrate ${tsconfigTestPath}`, { cause: error });
  }
}

console.log("\n✨ Migration complete! Run 'bun install' to update dependencies.");
