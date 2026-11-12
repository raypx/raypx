import { runTaskLeaf } from "../src/tasks.js";

process.exitCode = await runTaskLeaf({ runtime: process.execPath });
