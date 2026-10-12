import { pathExists } from "../runtime/files.js";
import { readFile } from "node:fs/promises";

import type { DoctorDependencies } from "./checks.js";
import { getDatabaseScriptsEnv } from "../env.js";
import { resolveProcessEnvironment } from "../runtime/env.js";
import { runChildProcess } from "../runtime/process.js";
import { repositoryRoot } from "../runtime/repository.js";

export function createDoctorDependencies(): DoctorDependencies {
  return {
    repositoryRoot,
    readFile: (path) => readFile(path, "utf8"),
    pathExists,
    async probe(command) {
      const result = await runChildProcess(command, { captureOutput: true });
      if (result.code !== 0 || result.signal) {
        throw new Error(`${command[0] ?? "command"} is not available`);
      }
      return result.stdout || result.stderr;
    },
    validateEnvironment() {
      getDatabaseScriptsEnv(resolveProcessEnvironment("repository"));
    },
  };
}
