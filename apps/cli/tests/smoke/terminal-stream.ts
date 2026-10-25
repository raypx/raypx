import assert from "node:assert/strict";
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { JsonProcess } from "../../src/runtime/agents/transport";

if (process.env.RAYPX_LIVE_AGENTS !== "1")
  throw new Error("Set RAYPX_LIVE_AGENTS=1 to record the real Codex stream");
const executable = process.env.RAYPX_CODEX_BINARY ?? Bun.which("codex");
if (!executable) throw new Error("Codex executable is unavailable");
const directory = await mkdtemp(join(tmpdir(), "raypx-stream-contract-"));
const home = join(directory, "codex");
await mkdir(home, { mode: 0o700 });
await copyFile(
  join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"),
  join(home, "auth.json"),
);
await chmod(join(home, "auth.json"), 0o600);
const events: Record<string, unknown>[] = [];
let complete: () => void;
const completed = new Promise<void>((resolve) => {
  complete = resolve;
});
const runner = new JsonProcess(
  executable,
  ["app-server"],
  directory,
  (value) => {
    events.push(value);
    if (value.method === "turn/completed") complete();
    // This scenario never authorizes a tool, even if the model ignores the prompt.
    if (value.id !== undefined && String(value.method).includes("requestApproval"))
      runner.send({ id: value.id, result: { decision: "decline" } });
  },
  { ...process.env, CODEX_HOME: home },
);
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  await runner.request("initialize", {
    clientInfo: { name: "raypx-contract", version: "0.1.0" },
    capabilities: { experimentalApi: true },
  });
  runner.send({ method: "initialized", params: {} });
  const thread = await runner.request("thread/start", {
    cwd: directory,
    sandbox: "read-only",
    approvalPolicy: "never",
    ephemeral: true,
  });
  const id = (thread.thread as { id: string }).id;
  await runner.request("turn/start", {
    threadId: id,
    input: [{ type: "text", text: "Reply exactly RAYPX_STREAM_P0. Do not call any tools." }],
    effort: "low",
  });
  await Promise.race([
    completed,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Codex stream timed out")), 90_000);
    }),
  ]);
  assert.ok(
    events.some((value) => value.method === "thread/tokenUsage/updated"),
    "Real stream contains no token usage event",
  );
  await writeFile(
    join(directory, "events.jsonl"),
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    { mode: 0o600 },
  );
  const version = (await Bun.$`${executable} --version`.text()).trim();
  const metadata = {
    provider: "codex",
    version,
    transport: "app-server",
    scenario: "stream-and-usage",
    recordedAt: new Date().toISOString(),
    directory,
  };
  await writeFile(join(directory, "metadata.json"), JSON.stringify(metadata, null, 2), {
    mode: 0o600,
  });
  console.info(JSON.stringify(metadata));
} finally {
  clearTimeout(timer);
  await runner.kill();
  await runner.completed.catch(() => {});
  await rm(join(home, "auth.json"), { force: true });
}
