import { startTerminalHost } from "../../../src/runtime/terminal/host";
startTerminalHost({
  profileDirectory: process.argv[2]!,
  directory: process.argv[2]!,
  projects: [],
});
