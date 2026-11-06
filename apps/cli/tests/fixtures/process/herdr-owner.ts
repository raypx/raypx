import { readStandardInput } from "@raypx/runtime-node/process";
import { HerdrTerminalHost } from "../../../src/runtime/process/herdr.ts";
const [binary, root, report, ...compiled] = process.argv.slice(2);
const host = new HerdrTerminalHost(
  binary!,
  () => {},
  () => process.env,
  compiled.length ? compiled : undefined,
);
await host.open(
  {
    executable: process.execPath,
    args: [
      "-e",
      `
  const child = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "inherit" });
  require("node:fs").writeFileSync(${JSON.stringify(report)}, JSON.stringify([process.pid, child.pid]));
  setInterval(() => {}, 1000);
`,
    ],
    cwd: root!,
    timeoutMs: 20000,
  },
  80,
  24,
);
console.log("ready");
await readStandardInput();
await host.close();
