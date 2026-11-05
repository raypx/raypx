import { runTaskLeaf } from "@raypx-kit/devkit/tasks";

process.exitCode = await runTaskLeaf({ runtime: "pnpm" });
