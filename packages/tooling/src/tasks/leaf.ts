import { runTaskLeaf } from "@raypx-kit/devkit/tasks";
import { taskScripts } from "./delegation.js";
process.exitCode = await runTaskLeaf({
  runtime: process.execPath,
  command(manifest, name, args) {
    const delegated = taskScripts(manifest)[name];
    const native = manifest.scripts["native:build"] && manifest.scripts["native:prepare"];
    return delegated
      ? [process.execPath, "run", delegated, ...args]
      : native &&
          [
            "native:build",
            "check",
            "build",
            "build:renderer",
            "dev",
            "native:smoke",
            "native:smoke:interactive",
            "native:beta",
            "native:agents",
          ].includes(name)
        ? [process.execPath, "run", "scripts/native/task.ts", "--leaf", name, ...args]
        : [process.execPath, "run", name, ...args];
  },
});
