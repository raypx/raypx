import { afterEach, expect, it, vi } from "vitest";
import type { ToolCall } from "@raypx/ai";
import { createApiClient } from "@raypx/client/api";
import { MAX_TOOL_RESULT } from "@raypx/core/approvals";
import { SpaceMutationError, SpaceNotFound } from "@raypx/core/spaces";
import { EFFECT_INTENT_TIMEOUT_MS } from "@raypx/agents/server";
import { createApiApp } from "../../tests/helpers/app.js";
import { agentToolsFixture } from "../../tests/helpers/agent-tools.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
function fixture(options: Parameters<typeof agentToolsFixture>[0] = {}) {
  const f = agentToolsFixture(options);
  cleanups.push(() => f.runner.close());
  const app = createApiApp({ ...f, allowedOrigins: ["https://web.example.test"] });
  function client(origin = "https://web.example.test") {
    return createApiClient({
      baseUrl: "https://api.example.test",
      headers: { origin },
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    });
  }
  const rpc = client();
  const selection = { spaceId: f.spaceId, conversationId: f.conversationId };
  const send = (key = "first") =>
    rpc.conversations.send({
      ...selection,
      message: { idempotencyKey: key, text: "Do the fixture task" },
    });
  return { ...f, rpc, client, selection, send };
}
function write(id = "write"): ToolCall {
  return {
    type: "toolCall",
    id,
    name: "computer_write_file",
    arguments: { path: "note.txt", content: "Private file content" },
  };
}
function result(f: ReturnType<typeof fixture>, turn = 1) {
  const message = f.calls[turn]?.input.continuation
    ?.filter((entry) => entry.role === "toolResult")
    .at(-1);
  if (!message || message.role !== "toolResult") throw new Error("No tool result");
  const text = message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  return { message, text, value: JSON.parse(text) };
}
async function startWrite(f: ReturnType<typeof fixture>) {
  await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.toolCalls([write()]);
}

it("sends a screenshot to the model as bounded untrusted image content with metadata-only effect and activity", async () => {
  const f = fixture();
  const state = await f.computers.start(f.scope);
  if (state.status !== "available" || !state.computer) throw new Error("Missing computer");
  await f.provider.startScreen!({ id: state.computer.id, generation: state.computer.generation });
  await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.toolCalls([
    { type: "toolCall", id: "screen", name: "computer_screenshot", arguments: {} },
  ]);
  await expect.poll(() => f.calls.length).toBe(2);
  const output = result(f);
  expect(output.value).toMatchObject({ state: "succeeded", trust: "untrusted" });
  const image = output.message.content.find((part) => part.type === "image");
  if (image?.type !== "image") throw new Error("Missing screenshot model image");
  expect(Buffer.from(image.data, "base64").byteLength).toBeLessThanOrEqual(1024 * 1024);
  expect(f.effects).toMatchObject([{ toolName: "computer_screenshot", state: "succeeded" }]);
  expect(f.requests).toHaveLength(0);
  expect(JSON.stringify(f.effects)).not.toContain(image.data);
  expect(JSON.stringify(f.log)).not.toContain(image.data);
  expect(JSON.stringify(f.diagnostics)).not.toContain(image.data);
  expect(f.checkpoints.get(f.runs[0]!.id)?.untrustedInput).toBe(true);
  await f.rpc.approvals.updateSettings({
    expectedRevision: 0,
    mode: "ask",
    rules: [{ toolName: "computer_keyboard", executable: null, decision: "allow" }],
  });
  f.calls[1]!.toolCalls([
    {
      type: "toolCall",
      id: "after-image",
      name: "computer_keyboard",
      arguments: { kind: "text", text: "screen instruction" },
    },
  ]);
  await expect.poll(() => f.requests.length).toBe(1);
  expect(f.requests[0]!.toolName).toBe("computer_keyboard");
  await f.rpc.approvals.answer({
    spaceId: f.spaceId,
    requestId: f.requests[0]!.id,
    decision: "denied",
  });
  await expect.poll(() => f.calls.length).toBe(3);
  expect(result(f, 2).value).toMatchObject({ state: "denied" });
  expect(f.effects).toHaveLength(1);
  f.calls[2]!.complete("Screen inspected");
});

it.each(["ask", "never"] as const)("honors screenshot Block rules in %s mode", async (mode) => {
  const f = fixture();
  const screenshot = vi.spyOn(f.provider, "screenshot");
  await f.rpc.approvals.updateSettings({
    expectedRevision: 0,
    mode,
    rules: [{ toolName: "computer_screenshot", executable: null, decision: "block" }],
  });
  await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.toolCalls([
    { type: "toolCall", id: "blocked-screen", name: "computer_screenshot", arguments: {} },
  ]);
  await expect.poll(() => f.calls.length).toBe(2);
  expect(result(f).value).toMatchObject({ state: "blocked", refused: true });
  expect(screenshot).not.toHaveBeenCalled();
  expect(f.effects).toHaveLength(0);
  expect(f.requests).toHaveLength(0);
  f.calls[1]!.complete("Blocked");
});

it("approves screen input, pauses it during takeover without an effect intent, then records execution after release", async () => {
  let controlled = true;
  const f: ReturnType<typeof fixture> = fixture({
    screenControl: {
      async withAgentInput(_scope, _ref, operation) {
        if (controlled)
          throw Object.assign(new Error("SCREEN_CONTROL_HELD"), { code: "SCREEN_CONTROL_HELD" });
        return operation();
      },
      setPaused: (scope, run, paused) => f.repository.setComputerInputPaused!(scope, run, paused),
    },
  });
  const state = await f.computers.start(f.scope);
  if (state.status !== "available" || !state.computer) throw new Error("Missing computer");
  await f.provider.startScreen!({ id: state.computer.id, generation: state.computer.generation });
  const input = vi.spyOn(f.provider, "input");
  await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.toolCalls([
    {
      type: "toolCall",
      id: "keyboard",
      name: "computer_keyboard",
      arguments: { kind: "text", text: "private screen text" },
    },
  ]);
  await expect.poll(() => f.requests.length).toBe(1);
  expect(f.requests[0]).toMatchObject({
    toolName: "computer_keyboard",
    target: "screen",
    argumentSummary: "Keyboard input",
  });
  expect(input).not.toHaveBeenCalled();
  await f.rpc.approvals.answer({
    spaceId: f.spaceId,
    requestId: f.requests[0]!.id,
    decision: "approved",
  });
  await expect.poll(() => f.runs[0]!.computerInputPaused).toBe(true);
  expect(f.runs[0]!.state).toBe("waiting");
  expect(f.log).toContainEqual(
    expect.objectContaining({
      event: expect.objectContaining({
        kind: "run.state",
        state: "waiting",
        computerInputPaused: true,
      }),
    }),
  );
  expect(f.effects).toHaveLength(0);
  expect(input).not.toHaveBeenCalled();
  controlled = false;
  await expect.poll(() => f.calls.length).toBe(2);
  expect(f.runs[0]!.computerInputPaused).toBe(false);
  expect(input).toHaveBeenCalledOnce();
  expect(f.effects).toMatchObject([{ toolName: "computer_keyboard", state: "succeeded" }]);
  expect(JSON.stringify(f.log)).not.toContain("private screen text");
  f.calls[1]!.complete("Typed after release");
});

it("waits for Ask approval, accepts another message, resumes with a tool result and records the effect", async () => {
  const f = fixture();
  const writeFile = vi.spyOn(f.provider, "write");
  await startWrite(f);
  await expect.poll(() => f.runs[0]!.state).toBe("waiting");
  const pending = await f.rpc.approvals.pending({ spaceId: f.spaceId });
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({
    toolName: "computer_write_file",
    arguments: write().arguments,
    memberAccountId: "member",
  });
  expect(writeFile).not.toHaveBeenCalled();
  expect(f.computer()).toMatchObject({ state: "running" });
  await f.send("while-pending");
  expect(f.runs.map((run) => run.state)).toEqual(["waiting"]);
  const approved = await f.rpc.approvals.answer({
    spaceId: f.spaceId,
    requestId: pending[0]!.id,
    decision: "approved",
  });
  expect(approved.state).toBe("approved");
  await expect.poll(() => f.calls.length).toBe(2);
  expect(f.calls[1]!.input.continuation).toContainEqual(
    expect.objectContaining({ role: "user", content: "Do the fixture task" }),
  );
  expect(result(f).value).toMatchObject({ trust: "untrusted", state: "succeeded" });
  expect(writeFile).toHaveBeenCalledTimes(1);
  const effects = await f.rpc.approvals.effects({ spaceId: f.spaceId, runId: f.runs[0]!.id });
  expect(effects).toMatchObject([{ toolName: "computer_write_file", state: "succeeded" }]);
  const cards = f.log.filter(
    (entry) => entry.event.kind === "card.created" || entry.event.kind === "card.resolved",
  );
  expect(cards.map((entry) => entry.event.kind)).toEqual(["card.created", "card.resolved"]);
  expect(JSON.stringify(cards)).not.toContain("Private file content");
  f.calls[1]!.complete("Written");
  await expect.poll(() => f.runs.map((run) => run.state)).toEqual(["succeeded"]);
});

it("returns a denial to the model without executing the change", async () => {
  const f = fixture();
  const writeFile = vi.spyOn(f.provider, "write");
  await startWrite(f);
  await expect.poll(() => f.requests.length).toBe(1);
  await f.rpc.approvals.answer({
    spaceId: f.spaceId,
    requestId: f.requests[0]!.id,
    decision: "denied",
  });
  await expect.poll(() => f.calls.length).toBe(2);
  expect(result(f).value).toMatchObject({ state: "denied", refused: true });
  expect(result(f).message.isError).toBe(true);
  expect(writeFile).not.toHaveBeenCalled();
  expect(f.effects).toEqual([]);
  f.calls[1]!.complete("The change was refused");
});

it.each(["ask", "never"] as const)(
  "refuses a blocked tool without a request in %s mode",
  async (mode) => {
    const f = fixture();
    await f.rpc.approvals.updateSettings({
      expectedRevision: (await f.rpc.approvals.settings({})).revision,
      mode,
      rules: [{ toolName: "computer_write_file", executable: null, decision: "block" }],
    });
    await startWrite(f);
    await expect.poll(() => f.calls.length).toBe(2);
    expect(result(f).value).toMatchObject({ state: "blocked", refused: true });
    expect(f.requests).toEqual([]);
    expect(f.effects).toEqual([]);
    expect(f.computer()).toMatchObject({ state: "running" });
    f.calls[1]!.complete();
  },
);

it.each(["allowed", "never"] as const)(
  "executes an %s change without a request",
  async (policy) => {
    const f = fixture();
    await f.rpc.approvals.updateSettings({
      expectedRevision: (await f.rpc.approvals.settings({})).revision,
      mode: policy === "never" ? "never" : "ask",
      rules:
        policy === "allowed"
          ? [{ toolName: "computer_write_file", executable: null, decision: "allow" }]
          : [],
    });
    await startWrite(f);
    await expect.poll(() => f.calls.length).toBe(2);
    expect(result(f).value.state).toBe("succeeded");
    expect(f.requests).toEqual([]);
    expect(f.effects[0]!.state).toBe("succeeded");
    f.calls[1]!.complete();
  },
);

it("addresses requests to one member, rejects a second answer, and can remember an Allow rule", async () => {
  const f = fixture();
  await startWrite(f);
  await expect.poll(() => f.requests.length).toBe(1);
  const requestId = f.requests[0]!.id;
  const originalSession = await f.readSession();
  const resolver = vi.spyOn(f.spaces, "resolve");
  const originalResolve = resolver.getMockImplementation()!;
  resolver.mockImplementation(async (accountId, selected) => {
    if (accountId === "colleague" && selected === f.spaceId)
      return { ...f.scope, member: { ...f.scope.member, accountId } };
    return originalResolve(accountId, selected);
  });
  f.readSession.mockResolvedValue({
    ...originalSession!,
    user: { ...originalSession!.user, id: "colleague" },
    session: { ...originalSession!.session, userId: "colleague" },
  });
  expect(await f.rpc.approvals.pending({ spaceId: f.spaceId })).toEqual([]);
  await expect(
    f.rpc.approvals.answer({ spaceId: f.spaceId, requestId, decision: "approved" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  f.readSession.mockResolvedValue(originalSession);
  await f.rpc.approvals.answer({
    spaceId: f.spaceId,
    requestId,
    decision: "approved",
    allowTool: true,
  });
  await expect(
    f.rpc.approvals.answer({ spaceId: f.spaceId, requestId, decision: "denied" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await f.rpc.approvals.settings({})).rules).toContainEqual({
    toolName: "computer_write_file",
    executable: null,
    decision: "allow",
  });
  await expect.poll(() => f.calls.length).toBe(2);
  f.calls[1]!.toolCalls([write("allowed-later")]);
  await expect.poll(() => f.requests.length).toBe(2);
  await f.rpc.approvals.answer({
    spaceId: f.spaceId,
    requestId: f.requests[1]!.id,
    decision: "approved",
  });
  await expect.poll(() => f.calls.length).toBe(3);
  expect(f.requests).toHaveLength(2);
  expect(f.effects).toHaveLength(2);
  f.calls[2]!.complete();
});

it("expires a request using the injected clock and returns the explicit expiry to the model", async () => {
  const f = fixture({ requestTtlMs: 1000 });
  await startWrite(f);
  await expect.poll(() => f.requests.length).toBe(1);
  f.advance(1001);
  await expect.poll(() => f.calls.length).toBe(2);
  expect(f.requests[0]!.state).toBe("expired");
  expect(result(f).value).toMatchObject({ state: "expired", refused: true });
  expect(f.effects).toEqual([]);
  f.calls[1]!.complete();
});

it("stop resolves pending approvals as cancelled and cancels a running command", async () => {
  const pending = fixture();
  await startWrite(pending);
  await expect.poll(() => pending.requests.length).toBe(1);
  await pending.rpc.conversations.stop({ ...pending.selection, runId: pending.runs[0]!.id });
  expect(pending.requests[0]!.state).toBe("cancelled");
  expect(pending.runs[0]!.state).toBe("cancelled");
  const f = fixture();
  await f.rpc.approvals.updateSettings({
    expectedRevision: (await f.rpc.approvals.settings({})).revision,
    mode: "never",
    rules: [],
  });
  const execute = vi.spyOn(f.provider, "execute");
  await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.toolCalls([
    {
      type: "toolCall",
      id: "sleep",
      name: "computer_run_command",
      arguments: { executable: "sleep", argv: ["60"], cwd: "." },
    },
  ]);
  await expect.poll(() => execute).toHaveBeenCalledTimes(1);
  await f.rpc.conversations.stop({ ...f.selection, runId: f.runs[0]!.id });
  await expect.poll(() => f.effects[0]!.state).toBe("failed");
  expect(f.runs[0]!.state).toBe("cancelled");
  expect(f.calls).toHaveLength(1);
});

it("reuses recorded effects for identical calls and blocks continuation after an interrupted effect", async () => {
  const f = fixture();
  await f.rpc.approvals.updateSettings({
    expectedRevision: (await f.rpc.approvals.settings({})).revision,
    mode: "never",
    rules: [],
  });
  const writeFile = vi.spyOn(f.provider, "write");
  await startWrite(f);
  await expect.poll(() => f.calls.length).toBe(2);
  f.calls[1]!.toolCalls([write()]);
  await expect.poll(() => f.calls.length).toBe(3);
  expect(writeFile).toHaveBeenCalledTimes(1);
  expect(f.effects).toHaveLength(1);
  f.effects[0]!.state = "intent";
  f.effects[0]!.result = null;
  f.effects[0]!.completedAt = null;
  f.advance(EFFECT_INTENT_TIMEOUT_MS);
  expect(
    (await f.rpc.approvals.effects({ spaceId: f.spaceId, runId: f.runs[0]!.id }))[0]!.state,
  ).toBe("unknown");
  f.calls[2]!.toolCalls([write()]);
  await expect.poll(() => f.runs[0]!.state).toBe("failed");
  expect(f.runs[0]!.failureCode).toBe("EFFECT_UNKNOWN");
  expect(writeFile).toHaveBeenCalledTimes(1);
  expect(f.calls).toHaveLength(3);
});

it("bounds computer output before returning it to the model and refuses Auto explicitly", async () => {
  const f = fixture();
  await expect(
    f.rpc.approvals.updateSettings({
      expectedRevision: (await f.rpc.approvals.settings({})).revision,
      mode: "auto",
      rules: [],
    }),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "APPROVAL_MODE_UNAVAILABLE",
  });
  await f.rpc.approvals.updateSettings({
    expectedRevision: (await f.rpc.approvals.settings({})).revision,
    mode: "never",
    rules: [],
  });
  await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.toolCalls([
    {
      type: "toolCall",
      id: "long",
      name: "computer_run_command",
      arguments: { executable: "printf", argv: ["x".repeat(20_000)], cwd: "." },
    },
  ]);
  await expect.poll(() => f.calls.length).toBe(2);
  expect(result(f).text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT);
  expect(result(f).value).toMatchObject({ trust: "untrusted", truncated: true });
  f.calls[1]!.complete();
});

it("rejects a non-member before reading or answering requests and protects mutations with Origin", async () => {
  const f = fixture();
  await startWrite(f);
  await expect.poll(() => f.requests.length).toBe(1);
  const requestId = f.requests[0]!.id;
  await expect(
    f
      .client("https://evil.example.test")
      .approvals.answer({ spaceId: f.spaceId, requestId, decision: "approved" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    f.client("https://evil.example.test").approvals.updateSettings({
      expectedRevision: (await f.rpc.approvals.settings({})).revision,
      mode: "never",
      rules: [],
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const reads = vi.spyOn(f.agentApprovals, "listPending");
  const answers = vi.spyOn(f.agentApprovals, "answer");
  f.removeMember();
  await expect(f.rpc.approvals.pending({ spaceId: f.spaceId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    f.rpc.approvals.answer({ spaceId: f.spaceId, requestId, decision: "approved" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    f.rpc.approvals.effects({ spaceId: f.spaceId, runId: f.runs[0]!.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(reads).not.toHaveBeenCalled();
  expect(answers).not.toHaveBeenCalled();
  vi.spyOn(f.spaces, "resolve").mockRejectedValue(new SpaceNotFound());
});

it("returns the stable audit-unavailable code without answering an approval", async () => {
  const f = fixture();
  await startWrite(f);
  await expect.poll(() => f.requests.length).toBe(1);
  const request = f.requests[0]!;
  vi.spyOn(f.agentApprovals, "answer").mockRejectedValueOnce(
    new SpaceMutationError("SPACE_AUDIT_UNAVAILABLE"),
  );
  await expect(
    f.rpc.approvals.answer({
      spaceId: f.spaceId,
      requestId: request.id,
      decision: "approved",
    }),
  ).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    data: { error: { code: "SPACE_AUDIT_UNAVAILABLE" } },
  });
  expect(request.state).toBe("pending");
});

it("bounds tool rounds and stops before another effect can run", async () => {
  const f = fixture({ maxToolRounds: 1 });
  const writeFile = vi.spyOn(f.provider, "write");
  await f.rpc.approvals.updateSettings({
    expectedRevision: (await f.rpc.approvals.settings({})).revision,
    mode: "never",
    rules: [],
  });
  await startWrite(f);
  await expect.poll(() => f.calls.length).toBe(2);
  f.calls[1]!.toolCalls([write("over-budget")]);
  await expect.poll(() => f.runs[0]!.failureCode).toBe("TOOL_ROUND_LIMIT");
  expect(writeFile).toHaveBeenCalledTimes(1);
  expect(f.effects).toHaveLength(1);
  expect(f.calls).toHaveLength(2);
});

it("returns approval mode availability and a current-settings conflict for stale edits", async () => {
  const f = fixture();
  const initial = await f.rpc.approvals.settings({});
  expect(initial).toMatchObject({
    revision: 0,
    availableModes: [
      { mode: "ask", available: true, reasonCode: null },
      { mode: "never", available: true, reasonCode: null },
      { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
    ],
  });
  const current = await f.rpc.approvals.updateSettings({
    mode: "never",
    rules: [],
    expectedRevision: initial.revision,
  });
  expect(current.revision).toBe(1);
  await expect(
    f.rpc.approvals.updateSettings({
      mode: "ask",
      rules: [],
      expectedRevision: initial.revision,
    }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "APPROVAL_SETTINGS_CONFLICT",
    data: { code: "APPROVAL_SETTINGS_CONFLICT", settings: current },
  });
  expect(await f.rpc.approvals.settings({})).toEqual(current);
  await expect(
    f.rpc.approvals.updateSettings({
      mode: "auto",
      rules: [],
      expectedRevision: current.revision,
    }),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "APPROVAL_MODE_UNAVAILABLE",
    data: { reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
  });
});

it("exposes configured Auto and resolves a safe write with automatic review evidence through RPC", async () => {
  const complete = vi.fn(async () =>
    JSON.stringify({
      verdict: "approve",
      reason: "The requested change is bounded and reversible.",
      confidence: 1,
    }),
  );
  const f = fixture({
    reviewModel: {
      available: () => true,
      resolve: async () => ({ modelId: "fixture-review", complete }),
    },
  });
  const writeFile = vi.spyOn(f.provider, "write");
  expect((await f.rpc.approvals.settings({})).availableModes).toContainEqual({
    mode: "auto",
    available: true,
    reasonCode: null,
  });
  await f.rpc.approvals.updateSettings({ mode: "auto", rules: [], expectedRevision: 0 });
  expect(await f.rpc.approvals.effectiveMode({ spaceId: f.spaceId })).toMatchObject({
    mode: "auto",
    source: "account_default",
  });
  await startWrite(f);
  await expect.poll(() => f.calls.length).toBe(2);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 256 }));
  expect(writeFile).toHaveBeenCalledTimes(1);
  expect(await f.rpc.approvals.pending({ spaceId: f.spaceId })).toEqual([]);
  expect(f.requests[0]).toMatchObject({
    state: "approved",
    answeredByAccountId: null,
    review: {
      modelId: "fixture-review",
      verdict: "approve",
      reason: "The requested change is bounded and reversible.",
    },
  });
  const resolved = f.log.find((entry) => entry.event.kind === "card.resolved");
  expect(resolved?.event).toMatchObject({
    answeredByAccountId: null,
    review: { modelId: "fixture-review", verdict: "approve" },
  });
  f.calls[1]!.complete("Written");
});

it("keeps Auto unavailable when resolution disappears and asks for an untrusted Run without review", async () => {
  let available = true;
  const complete = vi.fn(async () => '{"verdict":"approve","reason":"Approved","confidence":1}');
  const f = fixture({
    reviewModel: {
      available: () => available,
      resolve: async () => (available ? { modelId: "fixture-review", complete } : undefined),
    },
  });
  await f.rpc.approvals.updateSettings({ mode: "auto", rules: [], expectedRevision: 0 });
  const claim = f.repository.claimNext.bind(f.repository);
  f.repository.claimNext = async (...args) => {
    const execution = await claim(...args);
    if (execution) execution.run.untrustedInput = true;
    return execution;
  };
  await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.toolCalls([write()]);
  await expect.poll(() => f.requests.length).toBe(1);
  expect(complete).not.toHaveBeenCalled();
  expect((await f.rpc.approvals.pending({ spaceId: f.spaceId }))[0]?.state).toBe("pending");
  available = false;
  const settings = await f.rpc.approvals.settings({});
  expect(settings.mode).toBe("auto");
  expect(settings.availableModes).toContainEqual({
    mode: "auto",
    available: false,
    reasonCode: "REVIEW_MODEL_NOT_CONFIGURED",
  });
  await f.rpc.conversations.stop({ ...f.selection, runId: f.runs[0]!.id });
});

it("falls back to a pending member request when a selected Auto reviewer cannot resolve", async () => {
  let available = true;
  const f = fixture({
    reviewModel: { available: () => available, resolve: async () => undefined },
  });
  await f.rpc.approvals.updateSettings({ mode: "auto", rules: [], expectedRevision: 0 });
  available = false;
  const writeFile = vi.spyOn(f.provider, "write");
  await startWrite(f);
  await expect.poll(() => f.requests.length).toBe(1);
  expect(writeFile).not.toHaveBeenCalled();
  expect((await f.rpc.approvals.settings({})).mode).toBe("auto");
  expect((await f.rpc.approvals.pending({ spaceId: f.spaceId }))[0]?.state).toBe("pending");
  await f.rpc.conversations.stop({ ...f.selection, runId: f.runs[0]!.id });
});
