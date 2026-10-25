import { startTerminalHost } from "../../../src/runtime/terminal/host";
startTerminalHost({ directory: process.argv[2]!, projects: [] });
