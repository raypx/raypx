import { fileURLToPath } from "node:url";
import { scriptLogger } from "../logger.ts";
import { run } from "../process.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));

/** Refresh public artifacts and validate script types before creating consumer fixtures. */
export async function prepareConsumer(): Promise<void> {
  const environment = { NODE_ENV: process.env.NODE_ENV };
  scriptLogger.start("Preparing consumer artifacts");
  const tools = await run(
    "bun",
    ["--no-install", "packages/config/src/environment.ts"],
    repository,
    120_000,
    environment,
  );
  if (tools.trim()) console.log(tools.trim());
  const build = await run(
    "bun",
    [
      "--no-install",
      "run",
      "vp",
      "run",
      "--filter",
      "@raypx/*",
      "--filter",
      "!@raypx/web",
      "build",
    ],
    repository,
    120_000,
    environment,
  );
  if (build.trim()) console.log(build.trim());
  const types = await run(
    "bun",
    ["--no-install", "run", "typecheck:scripts"],
    repository,
    120_000,
    environment,
  );
  if (types.trim()) console.log(types.trim());
}
