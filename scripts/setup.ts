#!/usr/bin/env bun
import { constants } from "node:fs";
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Creates the application's documented configuration without replacing an existing file. */
async function setup(): Promise<void> {
  const template = fileURLToPath(new URL("../apps/web/.env.example", import.meta.url));
  const target = fileURLToPath(new URL("../apps/web/.env", import.meta.url));
  try {
    await copyFile(template, target, constants.COPYFILE_EXCL);
    console.log("Created apps/web/.env from the supported configuration example.");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      console.log("apps/web/.env already exists; review its supported configuration in ENV.md.");
    else throw error;
  }
  console.log("Run bun run check:runtime-env, then bun run dev (http://127.0.0.1:5173).");
}

setup().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Setup failed");
  process.exitCode = 1;
});
