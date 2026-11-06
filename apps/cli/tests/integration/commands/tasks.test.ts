import { expect, it, vi } from "vite-plus/test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon } from "../../helpers/enrolled";
import { parseCliArgs } from "../../../src/commands/args";
import { runCommand } from "../../../src/commands";

it("renders nested task help without starting an owner", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await runCommand(parseCliArgs(["tasks", "approvals", "decide", "--help"]), {});
    expect(output.mock.calls[0]?.[0]).toContain("tasks approvals decide");
  } finally {
    output.mockRestore();
  }
});

it.skipIf(process.platform === "win32")(
  "keeps tasks alive across finite CLI exit and watch SIGINT, and preserves command receipts",
  async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "raypx-task-command-"));
    const project = join(dataDir, "project"),
      bin = join(dataDir, "bin");
    mkdirSync(project);
    mkdirSync(bin);
    cpSync(join(import.meta.dirname, "../../fixtures/agents"), bin, { recursive: true });
    const executable = join(bin, "codex");
    writeFileSync(executable, `#!${process.execPath}\nimport "./codex-interactive.ts";`, {
      mode: 0o700,
    });
    const host = await startDaemon({ dataDir, agentExecutables: { codex: executable } });
    const invoke = async (action: string, input?: unknown) => {
      const output = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await runCommand(
          parseCliArgs([
            "tasks",
            ...action.split(" "),
            ...(input === undefined ? [] : [JSON.stringify(input)]),
            "--json",
          ]),
          { dataDir },
        );
        return JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      } finally {
        output.mockRestore();
      }
    };
    let watch: ReturnType<typeof Bun.spawn> | undefined;
    try {
      const grant = await host.runtime.files.register(project);
      await invoke("configure", { rootId: grant.id, providers: ["codex"] });
      const input = {
        id: crypto.randomUUID(),
        projectId: grant.id,
        provider: "codex",
        mode: "run",
        prompt: "Synthetic task",
      };
      const created = await invoke("create", input);
      expect(created).toMatchObject({
        commandId: input.id,
        value: { id: input.id, status: "running" },
      });
      await expect.poll(() => existsSync(join(project, "delivered"))).toBe(true);
      expect(await invoke("create", input)).toEqual(created);
      await expect(invoke("create", { ...input, prompt: "Changed payload" })).rejects.toMatchObject(
        { code: "IDEMPOTENCY_CONFLICT" },
      );
      expect(await invoke("get", { id: input.id })).toMatchObject({ task: { status: "running" } });
      watch = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dirname, "../../../src/main.ts"),
          "tasks",
          "watch",
          JSON.stringify({ id: input.id }),
          "--data-dir",
          dataDir,
        ],
        { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
      );
      const reader = (watch.stdout as ReadableStream<Uint8Array>).getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain('"type":"snapshot"');
      watch.kill("SIGINT");
      await watch.exited;
      await reader.cancel();
      expect(await invoke("get", { id: input.id })).toMatchObject({ task: { status: "running" } });
      expect(await invoke("cancel", { id: input.id })).toMatchObject({
        value: { status: "cancelled" },
      });
    } finally {
      if (watch) {
        watch.kill();
        await watch.exited;
      }
      await host.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
);
