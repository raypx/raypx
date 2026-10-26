import { expect, it, vi } from "vite-plus/test";
import { CodexProvider } from "../../../src/runtime/agents/harness/providers/codex";
import { ClaudeProvider } from "../../../src/runtime/agents/harness/providers/claude";
import { initialExecutionPrompt } from "../../../src/runtime/agents/harness/execution";
import type {
  ProcessFactory,
  ProviderProcess,
} from "../../../src/runtime/agents/harness/providers/process";

it("keeps the 32k user-content budget independent of fixed host policy", () => {
  const id = crypto.randomUUID();
  const task = {
    id,
    deviceId: id,
    projectId: id,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "x".repeat(32000),
    status: "pending" as const,
    summary: "",
    parentTaskId: null,
    createdAt: "",
    updatedAt: "",
  };
  expect(initialExecutionPrompt(task)).toContain(task.prompt);
  expect(() =>
    initialExecutionPrompt({
      ...task,
      context: {
        capturedAt: new Date().toISOString(),
        sources: [
          {
            id,
            revision: 1,
            kind: "memory",
            name: "Reference",
            content: "Added material",
            scope: "device",
            project: null,
          },
        ],
      },
    }),
  ).toThrow("CONTEXT_TOO_LARGE");
});

function processFixture() {
  let receive!: (message: Record<string, unknown>) => void;
  const send = vi.fn();
  const process: ProviderProcess = {
    completed: new Promise<number>(() => {}),
    send,
    request: vi.fn(async () => ({})),
    control: vi.fn(async () => ({})),
    kill: vi.fn(async () => {}),
  };
  const factory: ProcessFactory = (_executable, _args, _directory, onMessage) => {
    receive = onMessage;
    return process;
  };
  return {
    process,
    send,
    factory,
    receive: (message: Record<string, unknown>) => receive(message),
  };
}
it("keeps Codex output and approval callbacks fenced to their execution owner", () => {
  const f = processFixture();
  let current = true;
  const record = vi.fn(),
    ask = vi.fn(async () => ({ type: "allow" as const })),
    completed = vi.fn();
  const provider = new CodexProvider(
    "codex",
    "/project",
    { current: () => current, record, ask, completed, failed: vi.fn(), turnId: vi.fn() },
    f.factory,
  );
  f.receive({ method: "item/agentMessage/delta", params: { delta: "Current" } });
  expect(provider.summary).toBe("Current");
  current = false;
  f.receive({ method: "item/agentMessage/delta", params: { delta: "Stale" } });
  f.receive({ id: 1, method: "item/commandExecution/requestApproval", params: {} });
  f.receive({ method: "turn/completed", params: { turn: { status: "completed" } } });
  expect(provider.summary).toBe("Current");
  expect(record).toHaveBeenCalledTimes(1);
  expect(ask).not.toHaveBeenCalled();
  expect(completed).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();
});
it("ignores session and result notifications from a replaced Claude process", () => {
  const f = processFixture();
  let current = true;
  const record = vi.fn(),
    session = vi.fn(),
    completed = vi.fn();
  const provider = new ClaudeProvider(
    "claude",
    "/project",
    { mode: "plan", hookUrl: "http://127.0.0.1/hook/id", hookToken: "fixture" },
    { current: () => current, record, session, completed },
    f.factory,
  );
  expect(provider.process).toBe(f.process);
  f.receive({ type: "system", session_id: "current" });
  current = false;
  f.receive({ type: "system", session_id: "old" });
  f.receive({ type: "result", is_error: true, result: "Old process failed" });
  expect(record).toHaveBeenCalledTimes(1);
  expect(session).toHaveBeenCalledExactlyOnceWith("current");
  expect(completed).not.toHaveBeenCalled();
});
