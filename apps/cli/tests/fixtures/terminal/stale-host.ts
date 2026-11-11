import { ProfileStorage } from "../../../src/runtime/sqlite/index.js";
import { startTerminalHost } from "../../../src/runtime/terminal/host.js";
startTerminalHost({
  database: new ProfileStorage(process.argv[2]!).database,
  directory: process.argv[2]!,
  projects: [],
});
