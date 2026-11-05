import { ProfileStorage } from "../../../src/runtime/sqlite/index.ts";
import { startTerminalHost } from "../../../src/runtime/terminal/host.ts";
await startTerminalHost({
  database: new ProfileStorage(process.argv[2]!).database,
  directory: process.argv[2]!,
  projects: [],
});
