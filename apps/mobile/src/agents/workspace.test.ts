import { afterEach, describe, expect, it, vi } from "vitest";
import {
  conversationDraftKey,
  writeConversationDraft,
  type AgentConversationView,
  type AgentsWorkspacePort,
  type ConversationSocketPort,
  type SpaceMembership,
} from "@raypx/agents/model";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import { agentIdSchema, conversationIdSchema } from "@raypx/core/agents";
import { messageIdSchema } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import { MobileWorkspace } from "./workspace.js";

const createdAt = "2026-11-14T00:00:00.000Z";
const owner = { origin: "https://raypx.test", accountId: "account" };
const workspaces: MobileWorkspace[] = [];

function membership(id: string): SpaceMembership {
  return {
    space: { id: spaceIdSchema.parse(id), name: id, createdAt, updatedAt: createdAt },
    member: {
      spaceId: spaceIdSchema.parse(id),
      accountId: owner.accountId,
      role: "owner",
      createdAt,
    },
  };
}

function item(id: string, spaceId = "space-one"): AgentConversationView {
  return {
    agent: {
      id: agentIdSchema.parse(id),
      spaceId: spaceIdSchema.parse(spaceId),
      name: id,
      instructions: "",
      model: { modelId: `model-${spaceId}` },
      createdAt,
      updatedAt: createdAt,
    },
    conversation: {
      id: conversationIdSchema.parse(`conversation-${id}`),
      spaceId: spaceIdSchema.parse(spaceId),
      agentId: agentIdSchema.parse(id),
      kind: "direct",
      createdAt,
    },
  };
}

const one = item("agent-one");
const two = item("agent-two", "space-two");

function messageEvent(value: AgentConversationView, sequence = 1): ConversationServerFrame {
  const selection = { spaceId: value.agent.spaceId, conversationId: value.conversation.id };
  const message = {
    id: messageIdSchema.parse(`message-${sequence}`),
    ...selection,
    sequence,
    author: { kind: "member" as const, accountId: owner.accountId },
    text: "A committed message",
    createdAt,
  };
  return {
    type: "event",
    entry: {
      message,
      event: { ...selection, kind: "message.created", sequence, messageId: message.id, createdAt },
    },
  };
}

function harness() {
  const connections: Array<Parameters<ConversationSocketPort["connect"]>[0]> = [];
  const frames: ConversationClientFrame[] = [];
  const close = vi.fn();
  const stored = new Map<string, string>();
  const preference = { read: vi.fn((): string | null => null), write: vi.fn() };
  const port: AgentsWorkspacePort = {
    spaces: {
      list: vi.fn(async () => [membership("space-one"), membership("space-two")]),
      create: vi.fn(),
    },
    agents: {
      list: vi.fn(async ({ spaceId }) => [spaceId === "space-one" ? one : two]),
      models: vi.fn(async ({ spaceId }) => [
        { modelId: `model-${spaceId}`, name: `Model ${spaceId}`, source: "deployment" as const },
      ]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    computers: {
      get: vi.fn(async () => ({ status: "not-configured" as const })),
      start: vi.fn(),
      stop: vi.fn(),
    },
    conversations: {
      snapshot: vi.fn(async ({ conversationId }) => ({
        conversation: conversationId === one.conversation.id ? one.conversation : two.conversation,
        cursor: 0,
        messages: [],
        runs: [],
        segments: [],
      })),
      send: vi.fn(),
      stop: vi.fn(),
    },
    approvals: { pending: vi.fn(async () => []), answer: vi.fn(), effects: vi.fn() },
  };
  const workspace = new MobileWorkspace(
    owner,
    port,
    {
      connect(callbacks) {
        connections.push(callbacks);
        return {
          send: (frame) => {
            frames.push(frame);
          },
          close,
        };
      },
    },
    {
      read: (key) => stored.get(key) ?? null,
      write: (key, value) => {
        stored.set(key, value);
      },
      remove: (key) => {
        stored.delete(key);
      },
    },
    preference,
  );
  workspaces.push(workspace);
  return { workspace, port, connections, frames, close, stored, preference };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.dispose();
});

describe("mobile workspace composition", () => {
  it("retains one controller and applied cursor across background and foreground", async () => {
    const h = harness();
    await h.workspace.refresh();
    h.workspace.setActive(true);
    h.workspace.enterConversation();
    await settle();
    const selected = h.workspace.conversation(one);
    await settle();
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    h.connections[0]!.onFrame(messageEvent(one));
    selected.conversation.setDraft("Unsent text");
    expect(h.frames.at(-1)).toMatchObject({ type: "ack", sequence: 1 });

    h.workspace.setActive(false);
    expect(h.close).toHaveBeenCalledOnce();
    h.connections[0]!.onFrame(messageEvent(one, 2));
    expect(selected.conversation.getSnapshot().cursor).toBe(1);
    h.workspace.setActive(true);
    await settle();
    expect(h.workspace.conversation(one)).toBe(selected);
    expect(h.connections).toHaveLength(2);
    h.connections[1]!.onFrame({ type: "ready", version: 1 });
    expect(h.frames.at(-1)).toMatchObject({ type: "subscribe", after: 1 });
    h.connections[1]!.onFrame(messageEvent(one));
    h.connections[1]!.onFrame(messageEvent(one, 2));
    expect(selected.conversation.getSnapshot()).toMatchObject({ cursor: 2, draft: "Unsent text" });
    expect(selected.conversation.getSnapshot().messages).toHaveLength(2);
    expect(h.port.conversations.snapshot).toHaveBeenCalledOnce();
    expect(h.port.conversations.send).not.toHaveBeenCalled();
    expect(h.port.approvals?.pending).toHaveBeenCalled();
  });

  it("restores a scoped draft without opening a background socket or sending", async () => {
    const h = harness();
    const selection = { spaceId: one.agent.spaceId, conversationId: one.conversation.id };
    h.stored.set(
      conversationDraftKey(owner, selection),
      writeConversationDraft({ text: "Saved on device", pending: null }),
    );
    await h.workspace.refresh();
    h.workspace.enterConversation();
    const selected = h.workspace.conversation(one);
    expect(selected.conversation.getSnapshot().draft).toBe("Saved on device");
    expect(h.port.conversations.snapshot).not.toHaveBeenCalled();
    expect(h.connections).toHaveLength(0);
    h.workspace.setActive(true);
    h.workspace.enterConversation();
    await settle();
    expect(h.connections).toHaveLength(1);
    expect(h.port.conversations.send).not.toHaveBeenCalled();
    expect(selected.conversation.getSnapshot().draft).toBe("Saved on device");
  });

  it("ignores a stale directory refresh after changing Space", async () => {
    const h = harness();
    await h.workspace.refresh();
    let finish: (items: AgentConversationView[]) => void = () => {};
    vi.spyOn(h.port.agents, "list").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const oldRefresh = h.workspace.refresh("space-one");
    await Promise.resolve();
    h.workspace.selectSpace("space-two");
    await settle();
    finish([one]);
    await oldRefresh;
    expect(h.workspace.getSnapshot().page).toMatchObject({
      spaceId: "space-two",
      agents: [two],
      models: [{ modelId: "model-space-two", name: "Model space-two", source: "deployment" }],
    });
    expect(h.preference.write).toHaveBeenLastCalledWith("space-two");
    expect(() => h.workspace.conversation(one)).toThrow("Wrong Space");
  });

  it("uses fresh memberships when a stored Space is absent and discards revoked conversation state", async () => {
    const h = harness();
    h.preference.read.mockReturnValue("foreign-space");
    await h.workspace.refresh();
    expect(h.workspace.getSnapshot().page.spaceId).toBe("space-one");
    h.workspace.setActive(true);
    h.workspace.enterConversation();
    await settle();
    const old = h.workspace.conversation(one);
    await settle();
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    h.connections[0]!.onFrame(messageEvent(one));
    vi.spyOn(h.port.spaces, "list").mockResolvedValueOnce([membership("space-two")]);
    await h.workspace.refresh();
    expect(h.workspace.getSnapshot().page.spaceId).toBe("space-two");
    const previous = old.conversation.getSnapshot();
    h.connections[0]!.onFrame(messageEvent(one, 2));
    expect(old.conversation.getSnapshot()).toBe(previous);
    expect(h.close).toHaveBeenCalledOnce();
    expect(h.workspace.conversation(two)).not.toBe(old);
  });

  it("suspends on navigation away and resumes the same conversation only while active", async () => {
    const h = harness();
    await h.workspace.refresh();
    h.workspace.setActive(true);
    h.workspace.enterConversation();
    await settle();
    const selected = h.workspace.conversation(one);
    await settle();
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    h.workspace.leaveConversation();
    expect(h.close).toHaveBeenCalledOnce();
    h.workspace.setActive(false);
    expect(h.connections).toHaveLength(1);
    expect(h.workspace.conversation(one)).toBe(selected);
    h.workspace.setActive(true);
    await settle();
    expect(h.connections).toHaveLength(1);
    h.workspace.enterConversation();
    expect(h.connections).toHaveLength(2);
  });
});

it("carries durable conversation activity back to the Agent directory", async () => {
  const h = harness();
  h.workspace.setActive(true);
  await h.workspace.refresh();
  h.workspace.enterConversation();
  const selected = h.workspace.conversation(one);
  await vi.waitFor(() => expect(selected.conversation.getSnapshot().loading).toBe(false));
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  h.connections[0]!.onFrame(messageEvent(one));
  h.workspace.leaveConversation();
  expect(h.workspace.getSnapshot().page.agents[0]?.agent.lastActivityAt).toBe(createdAt);
  expect(h.workspace.getSnapshot().page.agents[0]?.conversation.lastActivityAt).toBe(createdAt);
});
