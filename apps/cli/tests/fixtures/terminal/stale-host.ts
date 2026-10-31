import { ProfileStorage } from "../../../src/runtime/sqlite";
import { startTerminalHost } from "../../../src/runtime/terminal/host";
startTerminalHost({
  database: new ProfileStorage(process.argv[2]!).database,
  directory: process.argv[2]!,
  projects: [],
});
