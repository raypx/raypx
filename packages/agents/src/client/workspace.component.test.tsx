import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
}: {
  models?: { modelId: string; name: string }[];
  snapshot?: ConversationSnapshot;
  language?: "en" | "zh";
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
    spaces: {
      list: async () => [membership],
      create: async ({ name }) => ({
        ...membership,
        space: { ...membership.space, id: spaceSchema.shape.id.parse("space-two"), name },
      }),
    },
    agents: {
      list: async () => [{ agent, conversation }],
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

it("hides a single Space selector and creates a Space before showing it", async () => {
  const test = fixture();
  test.mount();
  await screen.findByRole("button", { name: "Writing Agent" });
  expect(screen.queryByRole("combobox", { name: "Space" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New Space" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Space name" }), {
    target: { value: "Team Space" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create Space" }));
  await screen.findByRole("combobox", { name: "Space" });
  expect(screen.getByRole("combobox", { name: "Space" })).toHaveTextContent("Team Space");
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
  fireEvent.click(screen.getByRole("button", { name: "Edit Agent" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Edit Agent" }));
  const edit = await screen.findByRole("dialog");
  fireEvent.change(within(edit).getByRole("textbox", { name: "Name" }), {
    target: { value: "Edited Agent" },
  });
  fireEvent.click(within(edit).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(test.update).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Delete Agent" }));
  const confirm = await screen.findByRole("alertdialog");
  expect(test.remove).not.toHaveBeenCalled();
  fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(test.remove).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Delete Agent" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Delete Agent" }));
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
  const announcement = screen.getByText("Replying…");
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
