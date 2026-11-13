import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { agentSchema, conversationSchema } from "@raypx/core/agents";
import { messageSchema, runSchema } from "@raypx/core/conversation";
import { spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import type { ConversationServerFrame } from "@raypx/contracts/api";
import type {
  AgentsWorkspacePort,
  AgentConversationView,
  ConversationDraftStore,
  ConversationSocketPort,
  ConversationSnapshot,
} from "../model.js";
import { AgentsWorkspace } from "./workspace.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const time = "2026-11-13T03:00:00Z";
const membership = {
  space: spaceSchema.parse({
    id: "space-one",
    name: "Private Space",
    createdAt: time,
    updatedAt: time,
  }),
  member: spaceMemberSchema.parse({
    spaceId: "space-one",
    accountId: "account",
    role: "owner",
    createdAt: time,
  }),
};
const agent = agentSchema.parse({
  id: "agent-one",
  spaceId: "space-one",
  name: "Writing Agent",
  instructions: "Be concise",
  model: { modelId: "fixture" },
  createdAt: time,
  updatedAt: time,
});
const conversation = conversationSchema.parse({
  id: "conversation-one",
  spaceId: "space-one",
  agentId: "agent-one",
  kind: "direct",
  createdAt: time,
});
const message = messageSchema.parse({
  id: "message-one",
  spaceId: "space-one",
  conversationId: "conversation-one",
  sequence: 1,
  author: { kind: "member", accountId: "account" },
  text: "Hello Agent",
  createdAt: time,
});
const run = runSchema.parse({
  id: "run-one",
  spaceId: "space-one",
  conversationId: "conversation-one",
  agentId: "agent-one",
  trigger: "message",
  messageId: "message-one",
  memberAccountId: "account",
  model: { modelId: "fixture" },
  state: "running",
  failureCode: null,
  createdAt: time,
  startedAt: time,
  firstResponseAt: null,
  finishedAt: null,
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});

function fixture({
  models = [{ modelId: "fixture", name: "Fixture model" }],
  snapshot,
  language = "en",
  items = [{ agent, conversation }],
  memberships = [membership],
}: {
  models?: { modelId: string; name: string }[];
  snapshot?: ConversationSnapshot;
  language?: "en" | "zh";
  items?: AgentConversationView[];
  memberships?: (typeof membership)[];
} = {}) {
  let receive: ((frame: ConversationServerFrame) => void) | undefined;
  let close: ((code?: number) => void) | undefined;
  const frames: unknown[] = [];
  const socket: ConversationSocketPort = {
    connect(callbacks) {
      receive = (frame) => callbacks.onFrame(frame);
      close = (code) => callbacks.onClose(code);
      queueMicrotask(() => callbacks.onFrame({ type: "ready", version: 1 }));
      return { send: (frame) => frames.push(frame), close: () => {} };
    },
  };
  const storage = new Map<string, string>();
  const drafts: ConversationDraftStore = {
    read: (key) => storage.get(key) ?? null,
    write: (key, value) => {
      storage.set(key, value);
    },
    remove: (key) => {
      storage.delete(key);
    },
  };
  const send = vi.fn(async () => message);
  const update = vi.fn<AgentsWorkspacePort["agents"]["update"]>(async ({ agent: input }) => ({
    agent: { ...agent, ...input },
    conversation,
  }));
  const remove = vi.fn(async () => ({ deleted: true as const }));
  const create = vi.fn<AgentsWorkspacePort["agents"]["create"]>(async ({ agent: input }) => ({
    agent: { ...agent, ...input },
    conversation,
  }));
  const stop = vi.fn(async () => ({ ...run, state: "cancelled" as const }));
  const readSnapshot = vi.fn(
    async () => snapshot ?? { conversation, messages: [], runs: [], segments: [], cursor: 0 },
  );
  const client: AgentsWorkspacePort = {
    computers: {
      get: async () => ({ status: "not-configured" }),
      start: async () => ({ status: "not-configured" }),
      stop: async () => ({ status: "not-configured" }),
    },
    spaces: {
      list: async () => memberships,
      create: async ({ name }) => ({
        ...membership,
        space: { ...membership.space, id: spaceSchema.shape.id.parse("space-two"), name },
      }),
    },
    agents: {
      list: async () => items,
      models: async () => models,
      create,
      update,
      delete: remove,
    },
    conversations: { snapshot: readSnapshot, send, stop },
  };
  function mount(selected = false) {
    return render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <AgentsWorkspace
          client={client}
          accountId="account"
          origin="https://example.test"
          socket={socket}
          drafts={drafts}
          {...(selected ? { agentId: agent.id } : {})}
        />
      </BrowserLanguageProvider>,
    );
  }
  return {
    mount,
    client,
    drafts,
    storage,
    send,
    stop,
    update,
    remove,
    create,
    frames,
    readSnapshot,
    disconnect: async () => {
      await act(async () => close?.(1006));
    },
    emit: async (frame: ConversationServerFrame) => {
      await act(async () => receive?.(frame));
    },
  };
}

it("uses one Space menu to create and switch Spaces", async () => {
  const test = fixture();
  test.mount();
  await screen.findByRole("button", { name: "Writing Agent" });
  expect(screen.getAllByRole("button", { name: "Space" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Space" }));
  expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("menuitem", { name: "New Space" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Space name" }), {
    target: { value: "Team Space" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create Space" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Space" })).toHaveTextContent("Team Space"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Space" }));
  expect(await screen.findByRole("menuitemradio", { name: "Team Space" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Private Space" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Space" })).toHaveTextContent("Private Space"),
  );
});

it("shows the backend's empty model state without an empty picker", async () => {
  const test = fixture({ models: [] });
  test.mount();
  await screen.findByRole("button", { name: "Writing Agent" });
  fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("No models are available on this server.")).toBeInTheDocument();
  expect(within(dialog).queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
    target: { value: "Agent without a model" },
  });
  expect(within(dialog).getByRole("button", { name: "Create Agent" })).toBeDisabled();
  expect(test.create).not.toHaveBeenCalled();
});

it("allows metadata edits with an unchanged unavailable model and never chooses a fallback", async () => {
  const test = fixture({ models: [] });
  test.mount();
  await screen.findByRole("button", { name: "Writing Agent" });
  await rowAction("Edit Agent");
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("No models are available on this server.")).toBeInTheDocument();
  expect(within(dialog).getByText("Unavailable model: fixture")).toBeInTheDocument();
  expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
    target: { value: "Renamed Agent" },
  });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Instructions" }), {
    target: { value: "Updated instructions" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(test.update).toHaveBeenCalledWith({
      spaceId: agent.spaceId,
      id: agent.id,
      agent: {
        name: "Renamed Agent",
        instructions: "Updated instructions",
        model: { modelId: "fixture" },
      },
    }),
  );
});

it("creates and edits an Agent and confirms deletion", async () => {
  const test = fixture();
  test.mount();
  await screen.findByRole("button", { name: "Writing Agent" });
  fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
    target: { value: "Created Agent" },
  });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Instructions" }), {
    target: { value: "Explain carefully" },
  });
  expect(within(dialog).getByRole("combobox", { name: "Model" })).toHaveTextContent(
    "Fixture model",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Create Agent" }));
  await waitFor(() =>
    expect(test.create).toHaveBeenCalledWith({
      spaceId: agent.spaceId,
      agent: {
        name: "Created Agent",
        instructions: "Explain carefully",
        model: { modelId: "fixture" },
      },
    }),
  );
  await rowAction("Edit Agent");
  const edit = await screen.findByRole("dialog");
  fireEvent.change(within(edit).getByRole("textbox", { name: "Name" }), {
    target: { value: "Edited Agent" },
  });
  fireEvent.click(within(edit).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(test.update).toHaveBeenCalledOnce());
  await rowAction("Delete Agent");
  const confirm = await screen.findByRole("alertdialog");
  expect(test.remove).not.toHaveBeenCalled();
  fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(test.remove).not.toHaveBeenCalled();
  await rowAction("Delete Agent");
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete Agent" }),
  );
  await waitFor(() =>
    expect(test.remove).toHaveBeenCalledWith({ spaceId: agent.spaceId, id: agent.id }),
  );
});

it("converges streamed text to one committed segment without announcing each delta", async () => {
  const test = fixture({
    snapshot: { conversation, messages: [message], runs: [run], segments: [], cursor: 3 },
  });
  test.mount(true);
  await screen.findByText("Hello Agent");
  await waitFor(() =>
    expect(test.frames).toContainEqual({
      type: "subscribe",
      version: 1,
      spaceId: agent.spaceId,
      conversationId: conversation.id,
      after: 3,
    }),
  );
  await test.emit({
    type: "reply.prefix",
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    runId: run.id,
    segmentId: "reply-one",
    offset: 0,
    text: "A streamed",
  });
  expect(screen.getByText("A streamed")).toBeInTheDocument();
  const announcement = screen.getByRole("status");
  await test.emit({
    type: "reply.delta",
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    runId: run.id,
    segmentId: "reply-one",
    offset: 10,
    text: " reply",
  });
  expect(screen.getByText("A streamed reply")).toBeInTheDocument();
  expect(announcement).toHaveTextContent("Replying…");
  await test.emit({
    type: "event",
    entry: {
      event: {
        kind: "reply.segment",
        spaceId: agent.spaceId,
        conversationId: conversation.id,
        sequence: 4,
        createdAt: time,
        segment: {
          id: "reply-one",
          spaceId: agent.spaceId,
          conversationId: conversation.id,
          runId: run.id,
          sequence: 4,
          text: "The committed reply.",
          createdAt: time,
        },
      },
    },
  });
  expect(screen.queryByText("A streamed reply")).not.toBeInTheDocument();
  expect(screen.getAllByText("The committed reply.")).toHaveLength(1);
  expect(test.frames).toContainEqual({
    type: "ack",
    version: 1,
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    sequence: 4,
  });
  fireEvent.click(screen.getByRole("button", { name: "Stop reply" }));
  await waitFor(() => expect(test.stop).toHaveBeenCalledOnce());
});

it("keeps queued and failed states explicit and a retry only prepares the composer", async () => {
  const test = fixture({
    snapshot: {
      conversation,
      messages: [message],
      runs: [{ ...run, state: "failed", failureCode: "MODEL_UNAVAILABLE" }],
      segments: [],
      cursor: 4,
    },
  });
  test.mount(true);
  await screen.findByText("Failed");
  expect(screen.getByText("The selected model is unavailable.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Prepare retry" }));
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Hello Agent");
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
  expect(test.send).not.toHaveBeenCalled();
});

it("restores an unsent draft without sending it and supports Chinese labels", async () => {
  const test = fixture({ language: "zh" });
  const first = test.mount(true);
  const editor = await screen.findByRole("textbox", { name: "消息" });
  fireEvent.change(editor, { target: { value: "保留在设备上的长草稿" } });
  expect(test.storage.size).toBe(1);
  first.unmount();
  test.mount(true);
  expect(await screen.findByRole("textbox", { name: "消息" })).toHaveValue("保留在设备上的长草稿");
  expect(test.send).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
});

it("resumes from the applied cursor and replaces a required snapshot without duplicates", async () => {
  const initial = {
    conversation,
    messages: [message],
    runs: [{ ...run, state: "queued" as const }],
    segments: [],
    cursor: 2,
  };
  const test = fixture({ snapshot: initial });
  test.mount(true);
  await screen.findByText("Hello Agent");
  expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "A private unsent draft" },
  });
  await test.disconnect();
  await screen.findByText("Reconnecting…");
  const refreshButtons = screen.getAllByRole("button", { name: "Refresh" });
  fireEvent.click(refreshButtons.at(-1)!);
  await waitFor(() =>
    expect(
      test.frames.filter((frame) => (frame as { type: string }).type === "subscribe"),
    ).toHaveLength(2),
  );
  expect(test.frames.at(-1)).toEqual({
    type: "subscribe",
    version: 1,
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    after: 2,
  });
  test.readSnapshot.mockResolvedValueOnce({
    ...initial,
    runs: [{ ...run, state: "running" }],
    cursor: 3,
  });
  await test.emit({
    type: "snapshot-required",
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    cursor: 3,
  });
  await waitFor(() => expect(test.readSnapshot).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(test.frames.at(-1)).toEqual({
      type: "subscribe",
      version: 1,
      spaceId: agent.spaceId,
      conversationId: conversation.id,
      after: 3,
    }),
  );
  expect(screen.getAllByText("Hello Agent")).toHaveLength(1);
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("A private unsent draft");
  expect(test.send).not.toHaveBeenCalled();
});

it("drops stale account reads and never restores a draft into another account", async () => {
  const test = fixture();
  const first = test.mount(true);
  fireEvent.change(await screen.findByRole("textbox", { name: "Message" }), {
    target: { value: "Account one's draft" },
  });
  let finish!: (value: Awaited<ReturnType<AgentsWorkspacePort["spaces"]["list"]>>) => void;
  const late = new Promise<Awaited<ReturnType<AgentsWorkspacePort["spaces"]["list"]>>>(
    (resolve) => {
      finish = resolve;
    },
  );
  const secondClient = { ...test.client, spaces: { ...test.client.spaces, list: () => late } };
  first.rerender(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <AgentsWorkspace
        client={secondClient}
        accountId="second-account"
        origin="https://example.test"
        drafts={test.drafts}
        socket={{
          connect() {
            return { send() {}, close() {} };
          },
        }}
      />
    </BrowserLanguageProvider>,
  );
  expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
  await act(async () => finish([]));
  expect(screen.queryByText("Account one's draft")).not.toBeInTheDocument();
  expect(test.send).not.toHaveBeenCalled();
});

it("does not navigate after an Agent mutation completes for an unmounted account", async () => {
  const test = fixture();
  let finish!: (value: AgentConversationView) => void;
  const pending = new Promise<AgentConversationView>((resolve) => {
    finish = resolve;
  });
  test.create.mockImplementationOnce(() => pending);
  const navigate = vi.fn();
  const socket: ConversationSocketPort = {
    connect() {
      return { send() {}, close() {} };
    },
  };
  const view = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <AgentsWorkspace
        client={test.client}
        accountId="account"
        origin="https://example.test"
        onNavigate={navigate}
        socket={socket}
        drafts={test.drafts}
      />
    </BrowserLanguageProvider>,
  );
  await screen.findByRole("button", { name: "Writing Agent" });
  fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
    target: { value: "Late private Agent" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create Agent" }));
  await waitFor(() => expect(test.create).toHaveBeenCalledOnce());
  view.rerender(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <AgentsWorkspace
        client={test.client}
        accountId="second-account"
        origin="https://example.test"
        onNavigate={navigate}
        socket={socket}
        drafts={test.drafts}
      />
    </BrowserLanguageProvider>,
  );
  await act(async () => finish({ agent: { ...agent, name: "Late private Agent" }, conversation }));
  await screen.findByRole("button", { name: "Writing Agent" });
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.queryByText("Late private Agent")).not.toBeInTheDocument();
});

async function rowAction(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /Actions for/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name }));
}

it("sends on Enter, inserts a newline with Shift+Enter, and restores composer focus", async () => {
  const test = fixture();
  test.mount(true);
  const editor = await screen.findByRole("textbox", { name: "Message" });
  const user = userEvent.setup();
  await user.type(editor, "First line{Shift>}{Enter}{/Shift}Second line");
  expect(editor).toHaveValue("First line\nSecond line");
  expect(test.send).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(test.send).toHaveBeenCalledOnce());
  expect(test.send).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.objectContaining({ text: "First line\nSecond line" }),
    }),
  );
  expect(editor).toHaveValue("");
  expect(editor).toHaveFocus();
  expect(editor.className).toContain("max-h-48");
});

it("does not send while Chinese IME composition or its keyCode fallback owns Enter", async () => {
  const test = fixture();
  test.mount(true);
  const editor = await screen.findByRole("textbox", { name: "Message" });
  fireEvent.change(editor, { target: { value: "你好" } });
  fireEvent.compositionStart(editor);
  fireEvent.keyDown(editor, { key: "Enter" });
  fireEvent.compositionEnd(editor);
  fireEvent.keyDown(editor, { key: "Enter", isComposing: true });
  fireEvent.keyDown(editor, { key: "Enter", keyCode: 229 });
  expect(test.send).not.toHaveBeenCalled();
  fireEvent.keyDown(editor, { key: "Enter" });
  await waitFor(() => expect(test.send).toHaveBeenCalledOnce());
});

it("switches Send to Stop for the selected conversation and back after cancellation", async () => {
  const test = fixture({
    snapshot: { conversation, messages: [message], runs: [], segments: [], cursor: 1 },
  });
  test.mount(true);
  await screen.findByRole("button", { name: "Send" });
  await test.emit({
    type: "event",
    entry: {
      event: {
        kind: "run.state",
        runId: run.id,
        spaceId: agent.spaceId,
        conversationId: conversation.id,
        sequence: 2,
        state: "queued",
        failureCode: null,
        createdAt: time,
      },
    },
  });
  expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  expect(screen.getByText("Queued")).toBeInTheDocument();
  const member = screen.getByText("Hello Agent").closest("article")!;
  expect(within(member).queryByText("Queued")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Stop reply" }));
  await waitFor(() =>
    expect(test.stop).toHaveBeenCalledWith({
      spaceId: agent.spaceId,
      conversationId: conversation.id,
      runId: run.id,
    }),
  );
  await test.emit({
    type: "event",
    entry: {
      event: {
        kind: "run.state",
        runId: run.id,
        spaceId: agent.spaceId,
        conversationId: conversation.id,
        sequence: 3,
        state: "cancelled",
        failureCode: null,
        createdAt: time,
      },
    },
  });
  expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Stop reply" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("log")).getByText("Stopped")).toBeInTheDocument();
});

it("follows output only while pinned and offers an explicit jump when reading older messages", async () => {
  const test = fixture({
    snapshot: { conversation, messages: [message], runs: [run], segments: [], cursor: 3 },
  });
  test.mount(true);
  await screen.findByText("Hello Agent");
  const log = screen.getByRole("log");
  let height = 1000;
  Object.defineProperties(log, {
    scrollHeight: { configurable: true, get: () => height },
    clientHeight: { configurable: true, value: 200 },
  });
  log.scrollTop = 800;
  fireEvent.scroll(log);
  height = 1100;
  await test.emit({
    type: "reply.prefix",
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    runId: run.id,
    segmentId: "stream",
    offset: 0,
    text: "First",
  });
  expect(log.scrollTop).toBe(1100);
  log.scrollTop = 120;
  fireEvent.scroll(log);
  expect(screen.getByRole("button", { name: "Jump to latest" })).toBeInTheDocument();
  height = 1200;
  await test.emit({
    type: "reply.delta",
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    runId: run.id,
    segmentId: "stream",
    offset: 5,
    text: " update",
  });
  expect(log.scrollTop).toBe(120);
  fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
  expect(log.scrollTop).toBe(1200);
  expect(log).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Jump to latest" })).not.toBeInTheDocument();
  height = 1300;
  await test.emit({
    type: "reply.delta",
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    runId: run.id,
    segmentId: "stream",
    offset: 12,
    text: " again",
  });
  expect(log.scrollTop).toBe(1300);
});

it.each(["en", "zh"] as const)(
  "truncates long %s Agent names with accessible full names, secondary models and a row menu",
  async (language) => {
    const name =
      language === "zh"
        ? "用于很长的项目名称和任务说明的写作智能体".repeat(4)
        : "A very long Agent name with unbrokenwords".repeat(4);
    const test = fixture({ language, items: [{ agent: { ...agent, name }, conversation }] });
    test.mount();
    const row = await screen.findByRole("button", { name });
    expect(row).toHaveAttribute("title", name);
    expect(within(row).getByText(name)).toHaveClass("truncate");
    expect(within(row).getByText("Fixture model")).toHaveClass("truncate");
    expect(row.querySelector('[data-slot="avatar-fallback"]')).toHaveTextContent(
      Array.from(name)[0]!,
    );
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: language === "zh" ? `${name}的操作` : `Actions for ${name}`,
      }),
    );
    expect(
      await screen.findByRole("menuitem", {
        name: language === "zh" ? "编辑智能体" : "Edit Agent",
      }),
    ).toBeInTheDocument();
  },
);

it("focuses the conversation on selection and restores the selected row on Back", async () => {
  const test = fixture();
  test.mount();
  const row = await screen.findByRole("button", { name: "Writing Agent" });
  fireEvent.click(row);
  await screen.findByRole("textbox", { name: "Message" });
  expect(screen.getByRole("heading", { level: 2, name: "Writing Agent" })).toHaveFocus();
  expect(row).toHaveAttribute("aria-current", "page");
  fireEvent.click(screen.getByRole("button", { name: "Back to Agents" }));
  expect(row).toHaveFocus();
});

it("shows one sender for consecutive messages and no status for a completed reply", async () => {
  const test = fixture({
    snapshot: {
      conversation,
      messages: [
        message,
        {
          ...message,
          id: messageSchema.shape.id.parse("second"),
          sequence: 2,
          text: "A follow-up",
        },
      ],
      runs: [{ ...run, messageId: messageSchema.shape.id.parse("second"), state: "succeeded" }],
      segments: [
        {
          id: "segment",
          spaceId: agent.spaceId,
          conversationId: conversation.id,
          runId: run.id,
          sequence: 4,
          text: "A completed answer",
          createdAt: time,
        },
      ],
      cursor: 5,
    },
  });
  test.mount(true);
  const log = await screen.findByRole("log");
  await screen.findByText("A completed answer");
  expect(within(log).getAllByText("You")).toHaveLength(1);
  expect(within(log).queryByText("Completed")).not.toBeInTheDocument();
  expect(screen.queryByText("Live")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
});

it("shows an empty Space with one create action and a selection state when Agents exist", async () => {
  const test = fixture({ items: [] });
  const view = test.mount();
  await screen.findByText("No Agents in this Space");
  expect(screen.getAllByRole("button", { name: "New Agent" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  view.unmount();
  fixture().mount();
  expect(await screen.findByText("Choose an Agent to open its conversation.")).toBeInTheDocument();
});

it("shows no Spaces, loading, and a directory failure with an explicit retry", async () => {
  const empty = fixture({ memberships: [] });
  const view = empty.mount();
  await screen.findByText("Create a Space to get started.");
  expect(screen.getAllByRole("button", { name: "New Space" })).toHaveLength(1);
  view.unmount();
  const test = fixture();
  let finish!: (value: (typeof membership)[]) => void;
  test.client.spaces.list = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const loading = test.mount();
  await screen.findByText("Loading…");
  expect(screen.queryByText("No Agents in this Space")).not.toBeInTheDocument();
  await act(async () => finish([membership]));
  await screen.findByRole("button", { name: "Writing Agent" });
  loading.unmount();
  const failed = fixture();
  failed.client.spaces.list = vi
    .fn()
    .mockRejectedValueOnce(new Error("private diagnostic"))
    .mockResolvedValue([membership]);
  failed.mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load Spaces or Agents. Try again.",
  );
  expect(screen.queryByText("private diagnostic")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("button", { name: "Writing Agent" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("loads a conversation with one focus action and keeps failed loads retryable while editing", async () => {
  const test = fixture();
  let finish!: (snapshot: ConversationSnapshot) => void;
  test.readSnapshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  test.mount(true);
  await screen.findByRole("log");
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await act(async () => finish({ conversation, messages: [], runs: [], segments: [], cursor: 0 }));
  await screen.findByText("Start a conversation");
  fireEvent.click(screen.getByRole("button", { name: "Write a message" }));
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
  test.readSnapshot.mockRejectedValueOnce(new Error("private diagnostic"));
  await test.emit({
    type: "snapshot-required",
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    cursor: 0,
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load the conversation. Try again.",
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "Kept while unavailable" },
  });
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(screen.queryByText("private diagnostic")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Start a conversation");
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Kept while unavailable");
});

it("renders Markdown replies safely and preserves their DOM row through streaming and commit", async () => {
  const test = fixture({
    snapshot: { conversation, messages: [message], runs: [run], segments: [], cursor: 3 },
  });
  test.mount(true);
  await screen.findByText("Hello Agent");
  const log = screen.getByRole("log");
  const replyRow = log.querySelector('[data-message-row="reply:run-one"]');
  const text =
    "A **bold** reply with `inline code`.\n\n- First\n- Second\n\n```js\nconst safe = true;\n```\n\n[Safe](https://example.test) [Unsafe](javascript:alert%281%29)\n\n<script>alert('unsafe')</script>\n\n| One | Two |\n| --- | --- |\n| A | B |";
  await test.emit({
    type: "reply.prefix",
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    runId: run.id,
    segmentId: "segment",
    offset: 0,
    text,
  });
  expect(log.querySelector("strong")).toHaveTextContent("bold");
  expect(log.querySelector("ul")).toHaveTextContent("First Second");
  expect(within(log).getByRole("table")).toBeInTheDocument();
  expect(within(log).getByRole("button", { name: "Copy code" })).toBeInTheDocument();
  expect(within(log).getByRole("link", { name: "Safe" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  expect(within(log).getByRole("link", { name: "Safe" })).toHaveAttribute("target", "_blank");
  expect(log.querySelector("script")).toBeNull();
  expect(log.querySelector('a[href^="javascript:"]')).toBeNull();
  const copy = within(log).getByRole("button", { name: "Copy code" });
  await test.emit({
    type: "reply.delta",
    spaceId: agent.spaceId,
    conversationId: conversation.id,
    runId: run.id,
    segmentId: "segment",
    offset: text.length,
    text: "\n\nLast paragraph",
  });
  expect(within(log).getByRole("button", { name: "Copy code" })).toBe(copy);
  await test.emit({
    type: "event",
    entry: {
      event: {
        kind: "reply.segment",
        spaceId: agent.spaceId,
        conversationId: conversation.id,
        sequence: 4,
        createdAt: time,
        segment: {
          id: "segment",
          spaceId: agent.spaceId,
          conversationId: conversation.id,
          runId: run.id,
          sequence: 4,
          createdAt: time,
          text: text + "\n\nLast paragraph",
        },
      },
    },
  });
  expect(log.querySelector('[data-message-row="reply:run-one"]')).toBe(replyRow);
  expect(within(log).getByRole("button", { name: "Copy code" })).toBe(copy);
  await test.emit({
    type: "event",
    entry: {
      event: {
        kind: "run.state",
        spaceId: agent.spaceId,
        conversationId: conversation.id,
        runId: run.id,
        state: "succeeded",
        failureCode: null,
        sequence: 5,
        createdAt: time,
      },
    },
  });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Reply received."));
  expect(within(log).queryByText("Replying…")).not.toBeInTheDocument();
  expect(within(log).getAllByText("Last paragraph")).toHaveLength(1);
});

it("keeps unconfirmed delivery and Stop failures explicit without losing the draft", async () => {
  const test = fixture();
  test.send.mockRejectedValueOnce(new Error("sensitive"));
  test.mount(true);
  const editor = await screen.findByRole("textbox", { name: "Message" });
  fireEvent.change(editor, { target: { value: "Preserve this draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("button", { name: "Retry delivery" });
  expect(editor).toHaveValue("Preserve this draft");
  const pending = test.send.mock.calls[0];
  fireEvent.click(screen.getByRole("button", { name: "Retry delivery" }));
  await waitFor(() => expect(test.send).toHaveBeenCalledTimes(2));
  expect(test.send.mock.calls[1]).toEqual(pending);
  expect(editor).toHaveFocus();
  await test.emit({
    type: "event",
    entry: {
      event: {
        kind: "message.created",
        spaceId: agent.spaceId,
        conversationId: conversation.id,
        messageId: message.id,
        sequence: 1,
        createdAt: time,
      },
      message,
    },
  });
  await test.emit({
    type: "event",
    entry: {
      event: {
        kind: "run.state",
        spaceId: agent.spaceId,
        conversationId: conversation.id,
        runId: run.id,
        state: "running",
        failureCode: null,
        sequence: 2,
        createdAt: time,
      },
    },
  });
  test.stop.mockRejectedValueOnce(new Error("sensitive"));
  fireEvent.click(screen.getByRole("button", { name: "Stop reply" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not stop the reply. Try again.",
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Stop reply" })).toBeEnabled());
  expect(screen.queryByText("sensitive")).not.toBeInTheDocument();
});

it("resizes a multiline composer while preserving a CSS height limit", async () => {
  fixture().mount(true);
  const editor = await screen.findByRole("textbox", { name: "Message" });
  Object.defineProperty(editor, "scrollHeight", { configurable: true, value: 140 });
  fireEvent.change(editor, { target: { value: "First\nSecond\nThird" } });
  expect(editor.style.height).toBe("140px");
  Object.defineProperty(editor, "scrollHeight", { configurable: true, value: 400 });
  fireEvent.change(editor, { target: { value: "Long\n".repeat(20) } });
  expect(editor.style.height).toBe("400px");
  expect(editor).toHaveClass("max-h-48", "overflow-y-auto");
});

it("preserves the visible reading anchor when Markdown reflows and follows resizing only at the bottom", async () => {
  const observers: { callback: ResizeObserverCallback; nodes: Element[] }[] = [];
  class Observer {
    readonly record: (typeof observers)[number];
    constructor(callback: ResizeObserverCallback) {
      this.record = { callback, nodes: [] };
      observers.push(this.record);
    }
    observe(node: Element) {
      this.record.nodes.push(node);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
  try {
    const test = fixture({
      snapshot: { conversation, messages: [message], runs: [run], segments: [], cursor: 3 },
    });
    test.mount(true);
    await screen.findByText("Hello Agent");
    const log = screen.getByRole("log");
    let height = 1000;
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, get: () => height },
      clientHeight: { configurable: true, value: 200 },
    });
    const row = screen.getByText("Hello Agent").closest("article")!;
    let top = -100;
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => ({
      x: 0,
      y: top,
      top,
      bottom: top + 200,
      height: 200,
      width: 200,
      left: 0,
      right: 200,
      toJSON() {},
    }));
    log.scrollTop = 100;
    fireEvent.scroll(log);
    const observer = observers.find((entry) => entry.nodes.includes(log))!;
    top = -60;
    act(() => observer.callback([], {} as ResizeObserver));
    expect(log.scrollTop).toBe(140);
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
    height = 1500;
    act(() => observer.callback([], {} as ResizeObserver));
    expect(log.scrollTop).toBe(1500);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("shows draft storage failure without sending or clearing the editor", async () => {
  const test = fixture();
  test.drafts.write = () => {
    throw new Error("sensitive diagnostic");
  };
  test.mount(true);
  const editor = await screen.findByRole("textbox", { name: "Message" });
  fireEvent.change(editor, { target: { value: "Keep this on screen" } });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not save the draft on this device. Keep this page open.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(editor).toHaveValue("Keep this on screen");
  expect(test.send).not.toHaveBeenCalled();
  expect(screen.queryByText("sensitive diagnostic")).not.toBeInTheDocument();
});

it.each([
  [375, "en"],
  [1024, "en"],
  [1280, "en"],
  [1440, "en"],
  [375, "zh"],
  [1024, "zh"],
  [1280, "zh"],
  [1440, "zh"],
] as const)(
  "keeps a shrinkable conversation with the computer open and closed at %ipx in %s",
  async (width, language) => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(min-width: 1280px)" && width >= 1280,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      })),
    );
    try {
      const name = "Conversation fixture 长名称 long-name-".repeat(5);
      const view = fixture({
        language,
        items: [{ agent: { ...agent, name }, conversation }],
        snapshot: { conversation, messages: [message], runs: [run], segments: [], cursor: 3 },
      }).mount(true);
      const trigger = await screen.findByRole("button", {
        name:
          language === "en"
            ? "Computer: Not configured on this server"
            : "电脑：此服务器未配置电脑",
      });
      const pane = screen.getByRole("region", {
        name: language === "en" ? "Conversation" : "对话",
      });
      const title = within(pane).getByRole("heading", { level: 2, name });
      const sender = within(pane).getByRole("heading", { level: 3, name });
      const editor = within(pane).getByRole("textbox", {
        name: language === "en" ? "Message" : "消息",
      });
      function expectShrinkableConversation() {
        // Every flex ancestor must shrink, and clipping must not create scroll containers
        // that can shift the leading edge when the computer panel receives focus.
        for (
          let node: HTMLElement | null = pane;
          node && node !== view.container;
          node = node.parentElement
        ) {
          expect(node).toHaveClass("min-w-0", "overflow-clip");
        }
        expect(pane).toHaveClass("w-0", "flex-1");
        expect(pane.parentElement?.parentElement).toHaveClass("w-0", "flex-1");
        expect(title.parentElement).toHaveClass("min-w-0");
        expect(title).toHaveClass("min-w-0", "flex-1", "truncate");
        expect(title).toHaveAttribute("title", name);
        expect(trigger.parentElement).toHaveClass("shrink-0", "whitespace-nowrap");
        expect(trigger.parentElement).not.toHaveClass("truncate");
        expect(sender).toHaveClass("min-w-0", "truncate");
        expect(sender).toHaveAttribute("title", name);
        expect(sender).toHaveTextContent(name);
        // The same bounded wrapper sizes the sender and the bubble.
        expect(sender.parentElement).toHaveClass("min-w-0", "w-full", "max-w-[90%]");
        expect(sender.nextElementSibling).toHaveClass("min-w-0", "border");
        expect(editor.closest("form")).toHaveClass("min-w-0");
      }
      expect(sender).toHaveAccessibleName(name);
      expectShrinkableConversation();
      fireEvent.click(trigger);
      const heading = await screen.findByRole("heading", {
        name: language === "en" ? "Team computer" : "团队电脑",
      });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      const panel = screen.getByRole(width < 1280 ? "dialog" : "complementary", {
        name: language === "en" ? "Team computer" : "团队电脑",
      });
      expect(panel).toContainElement(heading);
      expect(panel.classList.contains("motion-reduce:transition-none")).toBe(width < 1280);
      expect(width >= 1280 && document.activeElement === heading).toBe(width >= 1280);
      expectShrinkableConversation();
      fireEvent.click(
        screen.getByRole("button", {
          name: language === "en" ? "Close computer panel" : "关闭电脑面板",
        }),
      );
      await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(sender).toHaveAccessibleName(name);
      expectShrinkableConversation();
      view.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
