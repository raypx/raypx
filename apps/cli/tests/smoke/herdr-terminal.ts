import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { LocalEvent } from "@raypx/contracts/local";
import { HerdrTerminalHost, terminalLaunch } from "../../src/runtime/process/herdr";
import { herdrRpc } from "../helpers/herdr-rpc";

// eslint-disable-next-line no-control-regex -- Inspect rendered ANSI fixture frames.
const ansi = /\x1b\[[0-?]*[ -/]*[@-~]/g;

const binary =
  process.env.RAYPX_HERDR_BINARY ??
  resolve(
    import.meta.dirname,
    "../../dist/herdr",
    process.platform === "win32" ? "herdr.exe" : "herdr",
  );
const root = await mkdtemp(join(tmpdir(), "raypx-herdr-smoke-"));
const events: LocalEvent[] = [];
const host = new HerdrTerminalHost(
  binary,
  (event) => events.push(event),
  () => process.env,
  process.env.RAYPX_CLI_BINARY
    ? [process.env.RAYPX_CLI_BINARY]
    : process.env.RAYPX_HERDR_COMPILED === "1"
      ? [
          resolve(
            import.meta.dirname,
            "../../dist",
            process.platform === "win32" ? "raypx.exe" : "raypx",
          ),
        ]
      : undefined,
);
const shell = (source: string) =>
  process.platform === "win32"
    ? {
        executable: process.env.ComSpec!,
        args: ["/D", "/Q", "/C", source],
        cwd: root,
        timeoutMs: 10000,
      }
    : { executable: "/bin/sh", args: ["-c", source], cwd: root, timeoutMs: 10000 };
async function settled(id: string) {
  const until = Date.now() + 12000;
  while (!events.some((event) => event.event === "terminal.exit" && event.data.id === id)) {
    if (Date.now() > until) throw new Error("Herdr terminal did not settle");
    await Bun.sleep(10);
  }
  return events.find((event) => event.event === "terminal.exit" && event.data.id === id)!;
}
try {
  await herdrRpc(
    process.env.RAYPX_HERDR_COMPILED === "1"
      ? [
          resolve(
            import.meta.dirname,
            "../../dist",
            process.platform === "win32" ? "raypx.exe" : "raypx",
          ),
        ]
      : terminalLaunch(),
    root,
    binary,
    {
      ...shell(
        process.platform === "win32"
          ? "echo rpc-output & exit /b 17"
          : "printf rpc-output; exit 17",
      ),
      cols: 80,
      rows: 24,
    },
  );
  console.log("Default Herdr backend through CLI RPC passed");
  const fast = await host.open(
    shell(
      process.platform === "win32"
        ? "echo final-output & exit /b 17"
        : "printf final-output; exit 17",
    ),
    80,
    24,
  );
  assert.equal((await settled(fast.id)).data.exitCode, 17);
  assert(
    events.some(
      (event) =>
        event.event === "terminal.output" &&
        event.data.id === fast.id &&
        Buffer.from(String(event.data.data), "base64").includes(Buffer.from("final-output")),
    ),
  );
  console.log("Herdr fast-exit retention and exit status passed");
  const interactive = await host.open(
    shell(
      process.platform === "win32"
        ? "set /p answer=ready & set answer & ping -n 60 127.0.0.1 >nul"
        : "printf ready; read value; stty size; printf 'answer:%s' \"$value\"; read done",
    ),
    80,
    24,
  );
  await host.resize(interactive.id, 100, 30);
  await host.input(
    interactive.id,
    Buffer.from(process.platform === "win32" ? "typed-value\r" : "中文-input\n").toString("base64"),
  );
  const expected = process.platform === "win32" ? "answer=typed-value" : "answer:中文-input";
  const until = Date.now() + 5000;
  while (
    !events.some(
      (event) =>
        event.event === "terminal.output" &&
        event.data.id === interactive.id &&
        Buffer.from(String(event.data.data), "base64")
          .toString()
          .replace(ansi, "")
          .includes(expected),
    )
  ) {
    if (Date.now() > until) {
      console.log(
        events
          .filter((event) => event.data.id === interactive.id)
          .map((event) =>
            event.event === "terminal.output"
              ? Buffer.from(String(event.data.data), "base64").toString().replace(ansi, "")
              : event.data,
          ),
      );
      throw new Error("Herdr input was not rendered");
    }
    await Bun.sleep(10);
  }
  host.cancel(interactive.id);
  await settled(interactive.id);
  assert(
    events.some(
      (event) =>
        event.event === "terminal.output" &&
        event.data.id === interactive.id &&
        event.data.cols === 100 &&
        event.data.rows === 30,
    ),
  );
  console.log("Herdr input, resize and owned process cancellation passed");
  const query = await host.open(
    {
      executable: process.execPath,
      args: [
        "-e",
        `
    process.stdin.setRawMode(true);
    let input = '';
    process.stdout.write('\\x1b[?1049h\\x1b[?2004h\\x1b[?1h\\x1b[?1000h\\x1b[?1006h\\x1b[3;7H\\x1b[6nmode-ready');
    process.stdin.on('data', chunk => {
      input += chunk.toString();
      if (input.includes('paste-value') && input.includes('\\x1bOA') && input.includes('\\x1b[<0;5;6M')) {
        console.log(input.includes('\\x1b[3;7R') ? 'cursor-reply:ok' : 'cursor-reply:missing');
        console.log(input.includes('\\x1b[200~paste-value\\x1b[201~') ? 'paste-mode:ok' : 'paste-mode:missing');
        console.log('application-key-mouse:ok');
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(42), 8000);
  `,
      ],
      cwd: root,
      timeoutMs: 10000,
    },
    80,
    24,
  );
  await Bun.sleep(100);
  await host.paste(query.id, "paste-value");
  await host.key(query.id, "up");
  await host.mouse(query.id, { action: "down", button: "left", column: 4, row: 5, modifiers: 0 });
  assert.equal((await settled(query.id)).data.exitCode, 0);
  const queryOutput = events
    .filter((event) => event.event === "terminal.output" && event.data.id === query.id)
    .map((event) => Buffer.from(String(event.data.data), "base64").toString().replace(ansi, ""))
    .join("");
  assert(
    queryOutput.includes("cursor-reply:ok"),
    "Herdr must answer cursor queries inside the PTY",
  );
  assert(
    queryOutput.includes("paste-mode:ok"),
    "Herdr must encode bracketed paste for the application",
  );
  console.log("Herdr cursor query, alternate screen and bracketed paste passed");
  const report = join(root, "owned-processes.json");
  const owner = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dirname, "../fixtures/process/herdr-owner.ts"),
      binary,
      root,
      report,
      ...(process.env.RAYPX_HERDR_COMPILED === "1"
        ? [
            resolve(
              import.meta.dirname,
              "../../dist",
              process.platform === "win32" ? "raypx.exe" : "raypx",
            ),
          ]
        : []),
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "ignore" },
  );
  const deadline = Date.now() + 12000;
  try {
    while (!(await Bun.file(report).exists())) {
      if (Date.now() > deadline || owner.exitCode !== null)
        throw new Error("Isolated Herdr owner did not start");
      await Bun.sleep(20);
    }
    const pids = (await Bun.file(report).json()) as number[];
    owner.kill();
    await owner.exited;
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    while (pids.some(alive)) {
      if (Date.now() > deadline) throw new Error("Owner exit left a terminal descendant running");
      await Bun.sleep(25);
    }
    console.log("Herdr supervisor EOF and descendant cleanup passed");
  } finally {
    owner.kill();
    await owner.exited;
  }
} finally {
  await host.close();
  await rm(root, { recursive: true, force: true, maxRetries: 10 });
}
