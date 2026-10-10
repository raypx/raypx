import { runCli } from "./cli.ts";

await runCli(["consumer", ...process.argv.slice(2)]);
