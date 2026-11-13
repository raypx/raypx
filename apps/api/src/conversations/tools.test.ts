import { afterEach, expect, it, vi } from "vitest";
import type { ToolCall } from "@raypx/ai";
import { createApiClient } from "@raypx/client/api";
import { MAX_TOOL_RESULT } from "@raypx/core/approvals";
import { SpaceNotFound } from "@raypx/core/spaces";
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
  expect(f.computer()).toBeNull();
  await f.send("while-pending");
  expect(f.runs.map((run) => run.state)).toEqual(["waiting", "queued"]);
  const approved = await f.rpc.approvals.answer({
    spaceId: f.spaceId,
    requestId: pending[0]!.id,
    decision: "approved",
  });
  expect(approved.state).toBe("approved");
  await expect.poll(() => f.calls.length).toBe(2);
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
  await expect.poll(() => f.calls.length).toBe(3);
  f.calls[2]!.complete("Next message");
  await expect.poll(() => f.runs.map((run) => run.state)).toEqual(["succeeded", "succeeded"]);
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
      mode,
      rules: [{ toolName: "computer_write_file", executable: null, decision: "block" }],
    });
    await startWrite(f);
    await expect.poll(() => f.calls.length).toBe(2);
    expect(result(f).value).toMatchObject({ state: "blocked", refused: true });
    expect(f.requests).toEqual([]);
    expect(f.effects).toEqual([]);
    expect(f.computer()).toBeNull();
    f.calls[1]!.complete();
  },
);

it.each(["allowed", "never"] as const)(
  "executes an %s change without a request",
  async (policy) => {
    const f = fixture();
    await f.rpc.approvals.updateSettings({
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
  await expect.poll(() => f.calls.length).toBe(3);
  expect(f.requests).toHaveLength(1);
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
  await f.rpc.approvals.updateSettings({ mode: "never", rules: [] });
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
  await f.rpc.approvals.updateSettings({ mode: "never", rules: [] });
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
  await expect(f.rpc.approvals.updateSettings({ mode: "auto", rules: [] })).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "APPROVAL_MODE_UNAVAILABLE",
  });
  await f.rpc.approvals.updateSettings({ mode: "never", rules: [] });
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
    f.client("https://evil.example.test").approvals.updateSettings({ mode: "never", rules: [] }),
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

it("bounds tool rounds and stops before another effect can run", async () => {
  const f = fixture({ maxToolRounds: 1 });
  const writeFile = vi.spyOn(f.provider, "write");
  await f.rpc.approvals.updateSettings({ mode: "never", rules: [] });
  await startWrite(f);
  await expect.poll(() => f.calls.length).toBe(2);
  f.calls[1]!.toolCalls([write("over-budget")]);
  await expect.poll(() => f.runs[0]!.failureCode).toBe("TOOL_ROUND_LIMIT");
  expect(writeFile).toHaveBeenCalledTimes(1);
  expect(f.effects).toHaveLength(1);
  expect(f.calls).toHaveLength(2);
});
