import { runCli } from "./cli.ts";

await runCli(["consumer-browser", ...process.argv.slice(2)]);
