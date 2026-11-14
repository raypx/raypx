import { afterEach, expect, it, vi } from "vitest";
import { pageVersionSchema } from "@raypx/core/pages";
import type { PagesService } from "@raypx/pages/server";
import { agentToolsFixture } from "../../tests/helpers/agent-tools.js";
import { withPageTools } from "./page-tools.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
function service() {
  let saved: ReturnType<typeof pageVersionSchema.parse> | undefined;
  const at = "2026-01-01T00:00:00.000Z";
  const create = vi.fn<PagesService["create"]>(async (scope, input, actor, id) => {
    saved = pageVersionSchema.parse({
      ...input,
      id,
      spaceId: scope.spaceId,
      version: 1,
      author: { kind: actor?.kind, accountId: actor?.accountId, runId: actor?.runId ?? null },
      reason: "created",
      createdAt: at,
      updatedAt: at,
    });
    return saved;
  });
  const update = vi.fn<PagesService["update"]>(async (_scope, id, expected, body) => {
    if (!saved || saved.id !== id || saved.version !== expected)
      throw new Error("Invalid fixture version");
    saved = { ...saved, body, version: expected + 1, reason: "updated" };
    return saved;
  });
  const pages = {
    create,
    update,
    get: async () => {
      if (!saved) throw new Error("Missing fixture page");
      return saved;
    },
  } as unknown as PagesService;
  return { pages, create, update, saved: () => saved };
}
it("refuses model-supplied Page activity metadata rather than copying it from arguments", () => {
  const f = agentToolsFixture();
  cleanups.push(() => f.runner.close());
  const s = service();
  const tools = withPageTools(f.tools, s.pages, () => []);
  for (const forged of [{ pageId: "forged", version: 99 }, { page: { id: "forged", version: 99 } }])
    expect(() =>
      tools.prepare({
        type: "toolCall",
        id: "create",
        name: "agent_page_create",
        arguments: { title: "Report", kind: "document", body: "Body", ...forged },
      }),
    ).toThrow("INVALID_ARGUMENTS");
  expect(s.create).not.toHaveBeenCalled();
});
it("asks for routine Page changes and asks again after untrusted results even with an exact Allow", async () => {
  const f = agentToolsFixture();
  cleanups.push(() => f.runner.close());
  const s = service();
  const checkpoints = vi.spyOn(f.repository, "saveCheckpoint");
  Object.assign(
    f.tools,
    withPageTools({ ...f.tools }, s.pages, () => []),
  );
  const claim = f.repository.claimNext.bind(f.repository);
  f.repository.claimNext = async (...args) => {
    const execution = await claim(...args);
    if (execution) {
      execution.run.trigger = "routine";
      f.runs.find((run) => run.id === execution.run.id)!.trigger = "routine";
    }
    return execution;
  };
  await f.agentApprovals.updateSettings("member", { expectedRevision: 0, mode: "ask", rules: [] });
  await f.conversations.send(f.scope, f.conversationId, {
    idempotencyKey: "page-routine",
    text: "Maintain the report",
  });
  await expect.poll(() => f.calls.length).toBe(1);
  expect(f.calls[0]!.input.tools?.map((tool) => tool.name)).toContain("agent_page_create");
  f.calls[0]!.toolCalls([
    {
      type: "toolCall",
      id: "create",
      name: "agent_page_create",
      arguments: { title: "Report", kind: "document", body: "Initial report" },
    },
  ]);
  await expect.poll(() => f.requests.length).toBe(1);
  expect(s.create).not.toHaveBeenCalled();
  expect(f.requests[0]).toMatchObject({
    state: "pending",
    toolName: "agent_page_create",
    memberAccountId: "member",
  });
  await f.agentApprovals.answer(f.scope, f.requests[0]!.id, { decision: "approved" });
  await expect.poll(() => f.calls.length).toBe(2);
  expect(s.create).toHaveBeenCalledTimes(1);
  expect(s.saved()).toMatchObject({
    agentId: "agent",
    author: { kind: "run", accountId: "member" },
  });
  await f.agentApprovals.updateSettings("member", {
    expectedRevision: 1,
    mode: "ask",
    rules: [{ toolName: "agent_page_update", executable: null, decision: "allow" }],
  });
  f.calls[1]!.toolCalls([
    {
      type: "toolCall",
      id: "update",
      name: "agent_page_update",
      arguments: { id: s.saved()!.id, expectedVersion: 1, body: "Updated report" },
    },
  ]);
  await expect.poll(() => f.requests.length).toBe(2);
  await f.agentApprovals.answer(f.scope, f.requests[1]!.id, { decision: "approved" });
  await expect.poll(() => f.calls.length).toBe(3);
  expect(checkpoints.mock.calls.map((call) => call[3]?.page)).toEqual([
    { id: s.saved()!.id, version: 1 },
    { id: s.saved()!.id, version: 2 },
  ]);
  expect(s.update).toHaveBeenCalledTimes(1);
  expect(f.requests).toHaveLength(2);
  expect(f.effects.map((effect) => [effect.toolName, effect.state])).toEqual([
    ["agent_page_create", "succeeded"],
    ["agent_page_update", "succeeded"],
  ]);
  f.calls[2]!.complete("Report saved");
  await expect.poll(() => f.runs[0]!.state).toBe("succeeded");
});
it("keeps exact Block precedence for Page changes", async () => {
  const f = agentToolsFixture();
  cleanups.push(() => f.runner.close());
  const s = service();
  Object.assign(
    f.tools,
    withPageTools({ ...f.tools }, s.pages, () => []),
  );
  await f.agentApprovals.updateSettings("member", {
    expectedRevision: 0,
    mode: "ask",
    rules: [{ toolName: "agent_page_create", executable: null, decision: "block" }],
  });
  await f.conversations.send(f.scope, f.conversationId, {
    idempotencyKey: "page-block",
    text: "Make a report",
  });
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.toolCalls([
    {
      type: "toolCall",
      id: "blocked",
      name: "agent_page_create",
      arguments: { title: "Report", kind: "document", body: "Report" },
    },
  ]);
  await expect.poll(() => f.calls.length).toBe(2);
  expect(s.create).not.toHaveBeenCalled();
  expect(f.requests).toHaveLength(0);
  f.calls[1]!.complete("Blocked");
  await expect.poll(() => f.runs[0]!.state).toBe("succeeded");
});
it("asks on an untrusted Run even when the member has an exact Page Allow rule", async () => {
  const f = agentToolsFixture();
  cleanups.push(() => f.runner.close());
  const s = service();
  Object.assign(
    f.tools,
    withPageTools({ ...f.tools }, s.pages, () => []),
  );
  const claim = f.repository.claimNext.bind(f.repository);
  f.repository.claimNext = async (...args) => {
    const execution = await claim(...args);
    if (execution) {
      execution.run.inboundProvenance = {
        kind: "webhook",
        routineId: "routine",
        deliveryId: "delivery",
      };
      f.runs.find((run) => run.id === execution.run.id)!.inboundProvenance =
        execution.run.inboundProvenance;
    }
    return execution;
  };
  await f.agentApprovals.updateSettings("member", {
    expectedRevision: 0,
    mode: "ask",
    rules: [{ toolName: "agent_page_create", executable: null, decision: "allow" }],
  });
  await f.conversations.send(f.scope, f.conversationId, {
    idempotencyKey: "page-untrusted",
    text: "Make a report",
  });
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.toolCalls([
    {
      type: "toolCall",
      id: "untrusted",
      name: "agent_page_create",
      arguments: { title: "Report", kind: "document", body: "Reference" },
    },
  ]);
  await expect.poll(() => f.requests.length).toBe(1);
  expect(s.create).not.toHaveBeenCalled();
  await f.agentApprovals.answer(f.scope, f.requests[0]!.id, { decision: "approved" });
  await expect.poll(() => f.calls.length).toBe(2);
  expect(s.create).toHaveBeenCalledTimes(1);
  f.calls[1]!.complete("Saved");
  await expect.poll(() => f.runs[0]!.state).toBe("succeeded");
});
