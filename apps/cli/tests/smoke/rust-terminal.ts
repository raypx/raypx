import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { LocalEvent } from "@raypx/contracts/local";
import { createRuntime } from "../../src/runtime/index.js";

if (process.platform === "win32")
  throw new Error("This POSIX smoke needs a separate Windows shell scenario");
const binary = process.env.RAYPX_TERMINAL_HOST;
if (!binary || !isAbsolute(binary))
  throw new Error("Set an absolute RAYPX_TERMINAL_HOST after building the Rust companion");
const directory = await mkdtemp(join(tmpdir(), "raypx-rust-terminal-"));
const events: LocalEvent[] = [];
const runtime = createRuntime({ dataDir: directory, emit: (event) => events.push(event) });
try {
  const opened = (await runtime.request("terminal.open", {
    executable: "/bin/sh",
    args: ["-c", "read value; stty size; printf 'rust-roundtrip:%s' \"$value\"; read done"],
    cwd: directory,
    cols: 80,
    rows: 24,
    timeoutMs: 10_000,
  })) as { id: string };
  await runtime.request("terminal.resize", { id: opened.id, cols: 120, rows: 40 });
  await runtime.request("terminal.input", {
    id: opened.id,
    data: Buffer.from("中文-input\n").toString("base64"),
  });
  const output = () =>
    Buffer.concat(
      events
        .filter((event) => event.event === "terminal.output" && event.data.id === opened.id)
        .map((event) => Buffer.from(String(event.data.data), "base64")),
    ).toString();
  const until = Date.now() + 5000;
  while (!output().includes("rust-roundtrip:中文-input")) {
    if (Date.now() >= until) throw new Error("Rust terminal did not return the expected bytes");
    await Bun.sleep(10);
  }
  if (!output().includes("40 120")) throw new Error("Rust terminal resize did not reach the PTY");
  await runtime.request("terminal.close", { id: opened.id });
  while (!events.some((event) => event.event === "terminal.exit" && event.data.id === opened.id)) {
    if (Date.now() >= until) throw new Error("Rust terminal did not terminate");
    await Bun.sleep(10);
  }
  console.log("Rust terminal smoke passed: CLI RPC, PTY bytes, Unicode, resize and cancellation");
} finally {
  await runtime.close();
  await rm(directory, { recursive: true, force: true });
}
