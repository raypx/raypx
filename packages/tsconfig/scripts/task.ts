import { runTaskLeaf } from "@raypx/devkit/tasks";

process.exitCode = await runTaskLeaf({ runtime: process.execPath });
