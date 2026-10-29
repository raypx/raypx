import { HerdrTerminalHost } from "../../../src/runtime/process/herdr";
const [binary, root, report, compiled] = process.argv.slice(2);
const host = new HerdrTerminalHost(
  binary!,
  () => {},
  () => process.env,
  compiled ? [compiled] : undefined,
);
await host.open(
  {
    executable: process.execPath,
    args: [
      "-e",
      `
  const child = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });
  await Bun.write(${JSON.stringify(report)}, JSON.stringify([process.pid, child.pid]));
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
await Bun.stdin.text();
await host.close();
