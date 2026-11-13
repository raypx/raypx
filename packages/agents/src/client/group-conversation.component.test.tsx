import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { agentSchema, conversationSchema } from "@raypx/core/agents";
import { messageSchema, runSchema } from "@raypx/core/conversation";
import { approvalRequestSchema } from "@raypx/core/approvals";
import { createBrowserI18n } from "@raypx/i18n/browser";
import commonEn from "@raypx/i18n/messages/en";
import commonZh from "@raypx/i18n/messages/zh";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
import type { ConversationServerFrame } from "@raypx/contracts/api";
import type { ApprovalPort, ConversationPort, ConversationSnapshot } from "../model.js";
import { AgentConversation } from "./conversation.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en & typeof commonEn>({
  en: { ...commonEn, ...en },
  zh: { ...commonZh, ...zh },
});
const time = "2026-11-14T00:00:00Z";
const agents = ["Coordinator 协调者", "Writer 写作者"].map((name, index) =>
  agentSchema.parse({
    id: `agent-${index}`,
    spaceId: "space",
    name,
    instructions: "",
    model: { modelId: "test" },
    createdAt: time,
    updatedAt: time,
  }),
);
const conversation = conversationSchema.parse({
  id: "group",
  spaceId: "space",
  agentId: "agent-0",
  kind: "group",
  name: "Team 团队",
  agentIds: agents.map((a) => a.id),
  createdAt: time,
});
const message = messageSchema.parse({
  id: "message",
  spaceId: "space",
  conversationId: "group",
  sequence: 1,
  author: { kind: "member", accountId: "member" },
  text: "work",
  createdAt: time,
});
function makeRun(index: number) {
  return runSchema.parse({
    id: `run-${index}`,
    spaceId: "space",
    conversationId: "group",
    agentId: `agent-${index}`,
    trigger: "message",
    messageId: "message",
    memberAccountId: "member",
    model: { modelId: "test" },
    state: "running",
    failureCode: null,
    createdAt: time,
    startedAt: time,
    firstResponseAt: null,
    finishedAt: null,
  });
}
function fixture(
  snapshot?: Partial<ConversationSnapshot>,
  language: "en" | "zh" = "en",
  approvals?: ApprovalPort,
) {
  let receive: ((frame: ConversationServerFrame) => void) | undefined;
  const send = vi.fn<ConversationPort["send"]>(async () => message);
  const stop = vi.fn(async ({ runId }) => ({
    ...makeRun(0),
    id: runId,
    state: "cancelled" as const,
  }));
  const port = {
    send,
    stop,
    snapshot: async () => ({
      conversation,
      messages: [],
      runs: [],
      segments: [],
      cursor: 0,
      ...snapshot,
    }),
  };
  const socket = {
    connect(callbacks: { onFrame: (frame: ConversationServerFrame) => void }) {
      receive = callbacks.onFrame;
      queueMicrotask(() => receive?.({ type: "ready", version: 1 }));
      return { send() {}, close() {} };
    },
  };
  const manage = vi.fn();
  const view = render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <AgentConversation
        approvalPort={approvals}
        group={{ conversation, agents }}
        onManageParticipants={manage}
        item={{ agent: agents[0]!, conversation }}
        port={port}
        computerPort={{
          get: async () => ({ status: "not-configured" }),
          start: async () => ({ status: "not-configured" }),
          stop: async () => ({ status: "not-configured" }),
        }}
        socket={socket}
        drafts={{ read: () => null, write() {}, remove() {} }}
        accountId="member"
        origin="https://test.example"
      />
    </BrowserLanguageProvider>,
  );
  return {
    ...view,
    send,
    stop,
    emit: async (frame: ConversationServerFrame) => act(async () => receive?.(frame)),
  };
}
it.each(["en", "zh"] as const)(
  "selects structured mentions by keyboard, dismisses once, and allows an unaddressed message in %s",
  async (language) => {
    const f = fixture(undefined, language);
    const user = userEvent.setup();
    const editor = await screen.findByRole("textbox", {
      name: language === "en" ? "Message" : "消息",
    });
    await waitFor(() =>
      expect(
        screen.queryByText(language === "en" ? "Connecting…" : "连接中…"),
      ).not.toBeInTheDocument(),
    );
    await user.type(editor, "@");
    const search = await screen.findByRole("combobox", {
      name: language === "en" ? "Mention an Agent" : "提及智能体",
    });
    await waitFor(() => expect(search).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(search).not.toBeInTheDocument());
    expect(editor).toHaveFocus();
    expect(editor).toHaveValue("@");
    fireEvent.select(editor);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.keyboard("W");
    const picker = await screen.findByRole("combobox", {
      name: language === "en" ? "Mention an Agent" : "提及智能体",
    });
    expect(picker).toHaveValue("W");
    await user.type(picker, "riter");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByRole("option", { name: agents[1]!.name })).toHaveAttribute(
      "data-value",
      agents[1]!.id,
    );
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(editor).toHaveValue(`@${agents[1]!.name} `));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(f.send).toHaveBeenCalledTimes(1));
    expect(f.send.mock.calls[0]?.[0]).toMatchObject({ message: { mentions: [agents[1]!.id] } });
    await user.type(editor, "No mention");
    expect(
      screen.getByText(
        language === "en"
          ? "No Agent will respond without a mention."
          : "未提及智能体，不会收到回复。",
      ),
    ).toBeVisible();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(f.send).toHaveBeenCalledTimes(2));
    expect(f.send.mock.calls[1]?.[0].message).not.toHaveProperty("mentions");
  },
);
it("keeps IME Enter in the editor and never parses a typed Agent name", async () => {
  const f = fixture();
  const editor = await screen.findByRole("textbox", { name: "Message" });
  await waitFor(() => expect(screen.queryByText("Connecting…")).not.toBeInTheDocument());
  fireEvent.compositionStart(editor);
  fireEvent.change(editor, { target: { value: `@${agents[0]!.name}` } });
  fireEvent.keyDown(editor, { key: "Enter", keyCode: 229, isComposing: true });
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
  expect(f.send).not.toHaveBeenCalled();
  fireEvent.compositionEnd(editor);
});
it("reopens a dismissed query after IME commits, while composition keeps Enter", async () => {
  const f = fixture();
  const user = userEvent.setup();
  const editor = await screen.findByRole("textbox", { name: "Message" });
  await user.type(editor, "@");
  await screen.findByRole("combobox", { name: "Mention an Agent" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(editor).toHaveFocus());
  fireEvent.compositionStart(editor);
  fireEvent.change(editor, { target: { value: "@Coord", selectionStart: 6 } });
  fireEvent.keyDown(editor, { key: "Enter", keyCode: 229, isComposing: true });
  fireEvent.keyDown(editor, { key: "m", ctrlKey: true, shiftKey: true });
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(f.send).not.toHaveBeenCalled();
  fireEvent.compositionEnd(editor);
  const picker = await screen.findByRole("combobox", { name: "Mention an Agent" });
  expect(picker).toHaveValue("Coord");
  await waitFor(() => expect(picker).toHaveFocus());
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(editor).toHaveValue(`@${agents[0]!.name} `));
  await waitFor(() => expect(editor).toHaveFocus());
  await user.keyboard("{Enter}");
  await waitFor(() => expect(f.send).toHaveBeenCalledTimes(1));
  expect(f.send.mock.calls[0]?.[0].message.mentions).toEqual([agents[0]!.id]);
});
it.each(["new @", "Control shortcut", "Meta shortcut"])(
  "reopens a dismissed mention using %s",
  async (method) => {
    fixture();
    const user = userEvent.setup();
    const editor = await screen.findByRole("textbox", { name: "Message" });
    await user.type(editor, "@");
    await screen.findByRole("combobox", { name: "Mention an Agent" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(editor).toHaveFocus());
    if (method === "new @") await user.keyboard("@");
    else
      fireEvent.keyDown(editor, {
        key: "m",
        ctrlKey: method === "Control shortcut",
        metaKey: method === "Meta shortcut",
        shiftKey: true,
      });
    await screen.findByRole("combobox", { name: "Mention an Agent" });
    expect(screen.getAllByRole("option")).toHaveLength(2);
  },
);
it("attributes interleaved replies and stops just the selected Agent Run", async () => {
  const f = fixture({ messages: [message], runs: [makeRun(0), makeRun(1)], cursor: 3 });
  await screen.findByRole("button", { name: `Stop ${agents[1]!.name}’s reply` });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Stop ${agents[1]!.name}’s reply` }));
  expect(f.stop).toHaveBeenCalledWith({
    spaceId: "space",
    conversationId: "group",
    runId: "run-1",
  });
  const log = screen.getByRole("log");
  expect(within(log).getByRole("heading", { name: agents[0]!.name })).toBeVisible();
  expect(within(log).getByRole("heading", { name: agents[1]!.name })).toBeVisible();
  await f.emit({
    type: "reply.prefix",
    offset: 0,
    spaceId: conversation.spaceId,
    conversationId: conversation.id,
    runId: makeRun(1).id,
    agentId: agents[1]!.id,
    segmentId: "segment-1",
    text: "Independent stream",
  });
  await screen.findByText("Independent stream");
  expect(f.stop).toHaveBeenCalledTimes(1);
});
it("hydrates child approvals in the flow and folds answered work into the child after reload", async () => {
  const parent = makeRun(0);
  const child = {
    ...makeRun(1),
    id: runSchema.shape.id.parse("child"),
    parentRunId: parent.id,
    state: "waiting" as const,
  };
  const call = {
    runId: child.id,
    agentId: child.agentId,
    parentRunId: parent.id,
    toolCallId: "write",
    toolName: "computer_write_file",
    target: "child.txt",
    argumentSummary: "Write file: child.txt",
    startedAt: time,
    finishedAt: null,
    durationMs: null,
    outcome: null,
    exitStatus: null,
  };
  let request = approvalRequestSchema.parse({
    id: "approval",
    spaceId: "space",
    conversationId: "group",
    runId: "child",
    memberAccountId: "member",
    toolCallId: "write",
    toolName: "computer_write_file",
    target: "child.txt",
    argumentSummary: "Write file: child.txt",
    arguments: { path: "child.txt", content: "test" },
    state: "pending",
    createdAt: time,
    expiresAt: "2099-01-01T00:00:00Z",
    resolvedAt: null,
    answeredByAccountId: null,
  });
  const answer = vi.fn<ApprovalPort["answer"]>(async () => {
    request = { ...request, state: "approved", resolvedAt: time, answeredByAccountId: "member" };
    return request;
  });
  const approvals: ApprovalPort = {
    pending: async () => (request.state === "pending" ? [request] : []),
    answer,
    effects: async () => [],
  };
  const snapshot = { messages: [message], runs: [parent, child], toolActivity: [call], cursor: 4 };
  const first = fixture(snapshot, "en", approvals);
  await screen.findByRole("button", { name: "Approve" });
  const card = first.container.querySelector("[data-approval-card]")!;
  expect(within(card as HTMLElement).getByText(`Requested by ${agents[1]!.name}`)).toBeVisible();
  expect(within(card as HTMLElement).getByText("Task: Delegated task")).toBeVisible();
  expect(first.container.querySelector('[data-message-row="reply:child"]')).toBeNull();
  first.unmount();
  const restored = fixture(snapshot, "en", approvals);
  const approve = await screen.findByRole("button", { name: "Approve" });
  const user = userEvent.setup();
  await user.click(approve);
  await waitFor(() => expect(restored.container.querySelector("[data-approval-card]")).toBeNull());
  expect(answer).toHaveBeenCalledWith({
    spaceId: "space",
    requestId: "approval",
    decision: "approved",
  });
  await user.click(screen.getByRole("button", { name: "Delegated work (1)" }));
  const childRow = restored.container.querySelector('[data-child-run-id="child"]')!;
  await user.click(within(childRow as HTMLElement).getByRole("button"));
  expect(within(childRow as HTMLElement).getByText("child.txt")).toBeVisible();
  expect(
    restored.container
      .querySelector('[data-tool-activity="child"]')
      ?.closest("[data-child-run-id]"),
  ).toBe(childRow);
});
it("limits Escape suppression to the exact text and caret", async () => {
  fixture();
  const editor = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: "Message" });
  const user = userEvent.setup();
  fireEvent.change(editor, { target: { value: "@Coord", selectionStart: 6 } });
  const first = await screen.findByRole("combobox", { name: "Mention an Agent" });
  await waitFor(() => expect(first).toHaveFocus());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(editor).toHaveFocus());
  fireEvent.select(editor);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  editor.setSelectionRange(3, 3);
  fireEvent.select(editor);
  const reopened = await screen.findByRole("combobox", { name: "Mention an Agent" });
  expect(reopened).toHaveValue("Co");
});
