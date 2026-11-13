import { describe, expect, it, vi } from "vitest";
import { agentIdSchema, conversationIdSchema } from "@raypx/core/agents";
import { messageIdSchema } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import { editMentionTokens, insertMention, mentionIds, validMentionTokens } from "./mentions.js";
import { readConversationDraft, writeConversationDraft } from "./drafts.js";
import { ConversationController } from "./controller.js";

const first = agentIdSchema.parse("first");
const second = agentIdSchema.parse("second");
describe("explicit mention tokens", () => {
  it("does not parse names in plain prose and preserves distinct IDs for identical labels", () => {
    expect(mentionIds([])).toEqual([]);
    const a = insertMention("@", [], 0, 1, first, "同名 Agent");
    const b = insertMention(
      a.text + "@",
      a.tokens,
      a.text.length,
      a.text.length + 1,
      second,
      "同名 Agent",
    );
    expect(mentionIds(b.tokens)).toEqual([first, second]);
    expect(mentionIds([...b.tokens, ...a.tokens])).toEqual([first, second]);
  });
  it("shifts intact tokens and removes tokens edited through their label", () => {
    const a = insertMention("@", [], 0, 1, first, "智能体");
    const shifted = editMentionTokens(a.text, "Hello " + a.text, a.tokens);
    expect(shifted[0]?.start).toBe(6);
    expect(editMentionTokens(a.text, a.text.replace("智", "新"), a.tokens)).toEqual([]);
    expect(editMentionTokens(a.text, a.text + "hello", a.tokens)).toEqual(a.tokens);
  });
  it("persists bounded validated ranges and freezes structured mentions in uncertain receipts", () => {
    const a = insertMention("@", [], 0, 1, first, "Agent");
    const pending = { text: a.text, idempotencyKey: "same-key", mentions: [first] };
    const draft = readConversationDraft(
      writeConversationDraft({ text: a.text, mentionTokens: a.tokens, pending }),
    );
    expect(draft).toEqual({ text: a.text, mentionTokens: a.tokens, pending });
    expect(validMentionTokens([{ ...a.tokens[0], end: 999 }], a.text)).toEqual([]);
    expect(validMentionTokens([{ ...a.tokens[0], label: "forged" }], a.text)).toEqual([]);
  });
  it("retries only the same explicit recipients after editing a draft and remounting", async () => {
    const selection = {
      spaceId: spaceIdSchema.parse("space"),
      conversationId: conversationIdSchema.parse("group"),
    };
    const store = new Map<string, string>();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({
        ...selection,
        id: messageIdSchema.parse("receipt"),
        sequence: 1,
        author: { kind: "member", accountId: "member" },
        text: "@Agent ",
        createdAt: "2026-11-14T00:00:00Z",
      });
    const options = {
      selection,
      owner: { accountId: "member", origin: "https://test.example" },
      port: { send, snapshot: vi.fn(), stop: vi.fn() },
      socket: { connect: vi.fn() },
      drafts: {
        read: (key: string) => store.get(key) ?? null,
        write: (key: string, value: string) => {
          store.set(key, value);
        },
        remove: (key: string) => {
          store.delete(key);
        },
      },
      key: () => "same-key",
    };
    const controller = new ConversationController(options);
    controller.setDraft("@");
    controller.addMention(0, 1, first, "Agent");
    expect(await controller.send()).toBe(false);
    expect(controller.getSnapshot().pending?.mentions).toEqual([first]);
    controller.dispose();
    const restored = new ConversationController(options);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await restored.sendPending()).toBe(true);
    expect(send.mock.calls[1]?.[0].message).toEqual({
      text: "@Agent ",
      idempotencyKey: "same-key",
      mentions: [first],
    });
    expect(restored.getSnapshot().mentionTokens).toEqual([]);
    restored.dispose();
  });
});
it("shows a non-participant refusal without preserving an uncertain receipt", async () => {
  const send = vi
    .fn()
    .mockRejectedValue({ data: { error: { code: "GROUP_AGENT_NOT_PARTICIPANT" } } });
  const controller = new ConversationController({
    selection: {
      spaceId: spaceIdSchema.parse("space"),
      conversationId: conversationIdSchema.parse("group"),
    },
    owner: { accountId: "member", origin: "https://test.example" },
    port: { send, snapshot: vi.fn(), stop: vi.fn() },
    socket: { connect: vi.fn() },
    drafts: { read: () => null, write() {}, remove() {} },
    key: () => "refusal-key",
  });
  controller.setDraft("@");
  controller.addMention(0, 1, first, "Agent");
  expect(await controller.send()).toBe(false);
  expect(controller.getSnapshot()).toMatchObject({
    pending: null,
    sendCode: "GROUP_AGENT_NOT_PARTICIPANT",
    draft: "@Agent ",
    error: null,
  });
  expect(send).toHaveBeenCalledTimes(1);
  controller.dispose();
});
