import { runTaskLeaf } from "@raypx-kit/devkit/tasks";
import { taskScripts } from "./delegation.ts";
process.exitCode = await runTaskLeaf({
  runtime: "pnpm",
  command(manifest, name, args) {
    const delegated = taskScripts(manifest)[name];
    const native = manifest.scripts["native:build"] && manifest.scripts["native:prepare"];
    return delegated
      ? ["pnpm", "run", delegated, ...args]
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
        ? [
            process.execPath,
            "--import",
            import.meta.resolve("tsx"),
            "scripts/host/task.ts",
            "--leaf",
            name,
            ...args,
          ]
        : ["pnpm", "run", name, ...args];
  },
});
