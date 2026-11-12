import { profileStorage, removeProfileDirectory } from "./sqlite.js";
import { afterEach } from "vitest";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../../src/runtime/state/index.js";
import { AgentRuntime } from "../../src/runtime/agents/index.js";
import type { Clock, Ids } from "../../src/runtime/agents/domain/ports.js";
import type { TaskChange } from "@raypx/contracts/tasks";

import type {
  AgentTask,
  AgentProvider,
  TaskContextSnapshot,
  TaskContextSelection,
  TaskContextTarget,
} from "@raypx/core/tasks";

export interface AgentFixtureOptions {
  interruptTimeoutMs?: number;
  clock?: Clock;
  ids?: Ids;
}

export function agentFixtures(runtimeOptions: AgentFixtureOptions = {}) {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });
  async function host(
    provider: AgentProvider,
    fixture:
      | "codex"
      | "codex-local-workflow"
      | "codex-descendant"
      | "codex-interactive"
      | "claude-interactive"
      | "claude-question"
      | "claude-plan"
      | "claude-headless-plan"
      | "orchestration",
    resolveContext?: (
      selection: TaskContextSelection,
      target: TaskContextTarget,
    ) => Promise<TaskContextSnapshot>,
    ports: { clock?: Clock; ids?: Ids } = {},
  ) {
    const directory = mkdtempSync(join(tmpdir(), "raypx-agent-"));
    const file = join(directory, provider);
    cpSync(join(import.meta.dirname, "../fixtures/agents"), directory, { recursive: true });
    const source = `import "./${fixture}.js";`;
    writeFileSync(file, `#!${process.execPath}\n${source}`, { mode: 0o700 });
    const state = new StateStore(profileStorage(directory));
    const rootId = crypto.randomUUID();
    state.putRoot({
      id: rootId,
      name: "Project",
      path: directory,
      createdAt: new Date().toISOString(),
    });
    const pending: string[] = [];
    const notifications: { pendingRequest?: string; change?: TaskChange }[] = [];
    const runtime = new AgentRuntime(
      state,
      (request, change) => {
        notifications.push({
          ...(request ? { pendingRequest: request } : {}),
          ...(change ? { change } : {}),
        });
        if (request) pending.push(request);
      },
      {
        ...runtimeOptions,
        ...ports,
        explicitExecutables: true,
        executables: { [provider]: file },
        ...(resolveContext ? { resolveContext } : {}),
      },
    );
    runtime.configure(rootId, [provider]);
    await runtime.capabilities();
    cleanups.push(async () => {
      await runtime.close();
      removeProfileDirectory(directory, { recursive: true, force: true });
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
    return { runtime, task, directory, state, pending, notifications };
  }
  return { host };
}
