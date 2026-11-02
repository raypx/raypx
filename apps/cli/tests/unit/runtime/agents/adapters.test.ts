import { expect, it, vi } from "vite-plus/test";
import { CodexAdapter } from "../../../../src/runtime/agents/harness/adapters/codex";
import { ClaudeAdapter } from "../../../../src/runtime/agents/harness/adapters/claude";
import { initialExecutionPrompt } from "../../../../src/runtime/agents/harness/execution";
import type {
  AgentTransport,
  TransportFactory,
} from "../../../../src/runtime/agents/harness/transport";

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
  const process: AgentTransport = {
    completed: new Promise<number>(() => {}),
    send,
    request: vi.fn(async () => ({})),
    control: vi.fn(async () => ({})),
    kill: vi.fn(async () => {}),
  };
  const factory: TransportFactory = (_executable, _args, _directory, onMessage) => {
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
  const emit = vi.fn(),
    ask = vi.fn(async () => ({ type: "allow" as const }));
  const provider = new CodexAdapter(
    { executable: "codex", directory: "/project", mode: "run", environment: {} },
    {
      approval: { ask, hook: () => ({ url: "http://127.0.0.1/hook", token: "fixture" }) },
      current: () => current,
      emit,
    },
    f.factory,
  );
  f.receive({ method: "item/agentMessage/delta", params: { delta: "Current" } });
  expect(provider.summary).toBe("Current");
  current = false;
  f.receive({ method: "item/agentMessage/delta", params: { delta: "Stale" } });
  f.receive({ id: 1, method: "item/commandExecution/requestApproval", params: {} });
  f.receive({ method: "turn/completed", params: { turn: { status: "completed" } } });
  expect(provider.summary).toBe("Current");
  expect(emit).toHaveBeenCalledTimes(1);
  expect(emit.mock.calls[0]?.[0]).toMatchObject({ type: "record" });
  expect(ask).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();
});
it("ignores session and result notifications from a replaced Claude process", () => {
  const f = processFixture();
  let current = true;
  const emit = vi.fn();
  const provider = new ClaudeAdapter(
    { executable: "claude", directory: "/project", mode: "plan", environment: {} },
    {
      approval: {
        ask: vi.fn(async () => ({ type: "allow" as const })),
        hook: () => ({ url: "http://127.0.0.1/hook/id", token: "fixture" }),
      },
      current: () => current,
      emit,
    },
    f.factory,
  );
  expect(provider.transport).toBe(f.process);
  f.receive({ type: "system", session_id: "current" });
  current = false;
  f.receive({ type: "system", session_id: "old" });
  f.receive({ type: "result", is_error: true, result: "Old process failed" });
  expect(emit).toHaveBeenCalledTimes(2);
  expect(emit.mock.calls[0]?.[0]).toMatchObject({ type: "record" });
  expect(emit.mock.calls[1]?.[0]).toMatchObject({ type: "session", id: "current" });
});
