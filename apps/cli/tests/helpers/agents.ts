import { afterEach } from "vite-plus/test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../../src/runtime/state";
import { AgentRuntime } from "../../src/runtime/agents";
import type {
  AgentTask,
  AgentProvider,
  TaskContextSnapshot,
  TaskContextSelection,
  TaskContextTarget,
} from "@raypx/contracts/tasks";

export function agentFixtures() {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });
  async function host(
    provider: AgentProvider,
    fixture:
      | "codex"
      | "codex-descendant"
      | "codex-interactive"
      | "claude-interactive"
      | "claude-question"
      | "claude-plan"
      | "claude-headless-plan",
    resolveContext?: (
      selection: TaskContextSelection,
      target: TaskContextTarget,
    ) => Promise<TaskContextSnapshot>,
  ) {
    const directory = mkdtempSync(join(tmpdir(), "raypx-agent-"));
    const file = join(directory, provider);
    cpSync(join(import.meta.dirname, "../fixtures/agents"), directory, { recursive: true });
    const source = readFileSync(join(directory, fixture + ".mjs"), "utf8");
    writeFileSync(file, `#!${process.execPath}\n${source}`, { mode: 0o700 });
    const state = new StateStore(directory);
    const rootId = crypto.randomUUID();
    state.putRoot({
      id: rootId,
      name: "Project",
      path: directory,
      createdAt: new Date().toISOString(),
    });
    const pending: string[] = [];
    const runtime = new AgentRuntime(
      state,
      (request) => {
        if (request) pending.push(request);
      },
      { executables: { [provider]: file }, ...(resolveContext ? { resolveContext } : {}) },
    );
    runtime.configure(rootId, [provider]);
    await runtime.capabilities();
    cleanups.push(async () => {
      await runtime.close();
      state.close();
      rmSync(directory, { recursive: true, force: true });
    });
    const task: AgentTask = {
      id: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      projectId: rootId,
      provider,
      mode: "run",
      prompt: "Task with private text",
      status: "pending",
      summary: "",
      parentTaskId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { runtime, task, directory, state, pending };
  }
  return { host };
}
