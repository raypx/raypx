import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { RepositoryProcessDependencies } from "../runtime/process-dependencies.js";
import {
  parseArtifactMetadata,
  resolveArtifactEntry,
  stageRuntimeArtifact,
  type RuntimeArtifactStage,
} from "./artifact.js";

interface WorkerRuntimeVerificationOptions {
  captureOutput?: boolean;
  readMetadata?: (path: string) => Promise<string>;
  stageOutput?: (sourceDirectory: string) => Promise<RuntimeArtifactStage>;
  timeoutMs?: number;
}

/** Exercise the real compiled host, sibling Runner and runtime assets outside the checkout. */
export async function verifyWorkerRuntime(
  dependencies: RepositoryProcessDependencies,
  options: WorkerRuntimeVerificationOptions = {},
): Promise<void> {
  const sourceDirectory = join(dependencies.repositoryRoot, "apps/worker/.output");
  const readMetadata = options.readMetadata ?? ((path) => readFile(path, "utf8"));
  const metadata = parseArtifactMetadata(await readMetadata(join(sourceDirectory, "nitro.json")), {
    name: "Worker",
  });
  resolveArtifactEntry(sourceDirectory, metadata.serverEntry);
  const stage = await (options.stageOutput ?? stageRuntimeArtifact)(sourceDirectory);
  try {
    dependencies.log("info", "verify.runtime.started", { service: "Worker" });
    await dependencies.runCommand(
      [
        "bun",
        "--no-env-file",
        "--no-install",
        resolveArtifactEntry(stage.directory, metadata.serverEntry),
        "--check",
      ],
      {
        captureOutput: options.captureOutput ?? false,
        cwd: stage.directory,
        env: { ...dependencies.processEnv, NODE_ENV: "production" },
        timeoutMs: options.timeoutMs ?? 60_000,
      },
    );
    dependencies.log("info", "verify.runtime.completed", { service: "Worker" });
  } finally {
    await stage.cleanup();
  }
}
