import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AppShell, type ShellLinkProps } from "@raypx/blocks/shell";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { agentSchema, conversationSchema } from "@raypx/core/agents";
import { messageSchema, runSchema } from "@raypx/core/conversation";
import { approvalRequestSchema } from "@raypx/core/approvals";
import { protectedInputRequestSchema } from "@raypx/core/protected-input";
import { spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import type { DeviceComputer, DeviceComputerSelection } from "@raypx/core/computers";
import type { DeviceComputersPort } from "../model/device-computers.js";
import { computerRecord, deferred } from "../../tests/support/computer-fixture.js";
import type { ConversationServerFrame } from "@raypx/contracts/api";
import type {
  AgentsWorkspacePort,
  AgentConversationView,
  ConversationDraftStore,
  ConversationSocketPort,
  ConversationSnapshot,
  ApprovalPort,
  SpaceManagementPort,
} from "../model.js";
import { AgentConversation } from "./conversation.js";
import { AgentsWorkspace, type AgentsWorkspaceProps } from "./workspace.js";
import commonEn from "@raypx/i18n/messages/en";
import commonZh from "@raypx/i18n/messages/zh";
import blocksEn from "@raypx/blocks/messages/en";
import blocksZh from "@raypx/blocks/messages/zh";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const catalogs = {
  en: { ...commonEn, ...blocksEn, ...en },
  zh: { ...commonZh, ...blocksZh, ...zh },
};
const { BrowserLanguageProvider } = createBrowserI18n<typeof catalogs.en>(catalogs);
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
  models = [{ modelId: "fixture", name: "Fixture model", source: "deployment" as const }],
  snapshot,
  language = "en",
  items = [{ agent, conversation }],
  memberships = [membership],
  approvals,
}: {
  models?: { modelId: string; name: string; source: "connection" | "deployment" }[];
  snapshot?: ConversationSnapshot;
  language?: "en" | "zh";
  items?: AgentConversationView[];
  memberships?: (typeof membership)[];
  approvals?: ApprovalPort;
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
    ...(approvals ? { approvals } : {}),
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
  function mount(
    selected = false,
    frame?: "document" | "window",
    onNavigate?: (selection: { spaceId: string; agentId?: string }) => void,
    composerReference?: { id: string; text: string },
    renderWorkspace?: AgentsWorkspaceProps["renderWorkspace"],
  ) {
    const workspace = (
      <AgentsWorkspace
        client={client}
        accountId="account"
        origin="https://example.test"
        socket={socket}
        drafts={drafts}
        {...(selected ? { agentId: agent.id } : {})}
        {...(onNavigate ? { onNavigate } : {})}
        {...(composerReference ? { composerReference } : {})}
        {...(renderWorkspace ? { renderWorkspace } : {})}
      />
    );
    return render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        {frame ? (
          <AppShell
            frame={frame}
            brand={{ to: "/agents", label: "Raypx" }}
            navigation={[]}
            breadcrumbs={[]}
            layout="tool"
            LinkComponent={HeaderTestLink}
          >
            {workspace}
          </AppShell>
        ) : (
          workspace
        )}
      </BrowserLanguageProvider>,
    );
  }
  return {
    mount,
    socket,
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

function enableDeviceComputer(client: AgentsWorkspacePort) {
  const device: DeviceComputer = {
    id: "018e2c42-08e0-4000-8000-000000000001",
    name: "My machine",
    platform: "darwin",
    connected: true,
    connectionState: "connected",
    createdAt: time,
    grants: [
      {
        id: "018e2c42-08e0-4000-8000-000000000002",
        spaceId: agent.spaceId,
        directory: "/my/project",
        revision: 1,
        revokedAt: null,
      },
    ],
  };
  let selection: DeviceComputerSelection | null = {
    deviceId: device.id,
    grantId: device.grants[0]!.id,
  };
  const port: DeviceComputersPort = {
    list: vi.fn(async () => ({ devices: [device] })),
    getSelection: vi.fn(async () => ({ selection })),
    select: vi.fn(async (input) => {
      selection = input.selection;
      return { selection };
    }),
    createPairing: vi.fn(),
    requestGrant: vi.fn(),
    revokeGrant: vi.fn(),
    revoke: vi.fn(),
  };
  const start = vi.fn(async () => ({ status: "not-configured" as const }));
  client.deviceComputers = port;
  client.computers = {
    get: async () => ({
      status: "available",
      computer: { ...computerRecord(), spaceId: agent.spaceId },
    }),
    start,
    stop: async () => ({ status: "not-configured" }),
  };
  return { port, start, device };
}

it.each(["en", "zh"] as const)(
  "keeps the chosen conversation's device selection in the %s home Computer chip",
  async (language) => {
    const context = fixture({ language });
    const { port, start } = enableDeviceComputer(context.client);
    const strings = catalogs[language].agents;
    context.mount();
    const label = strings.computerIndicator.replace(
      "{state}",
      `My machine · ${strings.devices.connected}`,
    );
    const chip = await screen.findByRole("button", { name: label });
    expect(port.getSelection).toHaveBeenCalledWith({
      spaceId: agent.spaceId,
      conversationId: conversation.id,
    });
    await userEvent.click(chip);
    const panel = await screen.findByRole("dialog", { name: strings.computerTitle });
    expect(
      within(panel).getByRole("combobox", { name: strings.devices.computer }),
    ).toHaveTextContent("My machine");
    expect(within(panel).getByText(strings.devices.warning)).toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: strings.computerStart }),
    ).not.toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh"] as const)(
  "opens selected device controls from the %s conversation chip before allowing a sandbox start",
  async (language) => {
    const context = fixture({ language });
    const { port, start } = enableDeviceComputer(context.client);
    const strings = catalogs[language].agents;
    context.mount(true);
    const state = `My machine · ${strings.devices.connected}`;
    await screen.findByRole("button", {
      name: strings.computerIndicator.replace("{state}", state),
    });
    await userEvent.click(
      screen.getByRole("button", { name: strings.composerComputer.replace("{state}", state) }),
    );
    const panel = await screen.findByRole("dialog", { name: strings.computerTitle });
    const picker = within(panel).getByRole("combobox", { name: strings.devices.computer });
    expect(picker).toHaveTextContent("My machine");
    expect(start).not.toHaveBeenCalled();
    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole("option", { name: strings.devices.teamSandbox }));
    await waitFor(() =>
      expect(port.select).toHaveBeenCalledWith({
        spaceId: agent.spaceId,
        conversationId: conversation.id,
        selection: null,
      }),
    );
    await userEvent.click(within(panel).getByRole("button", { name: strings.computerClose }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: strings.composerComputer.replace("{state}", strings.computerStopped),
      }),
    );
    await waitFor(() => expect(start).toHaveBeenCalledOnce());
  },
);

it("labels the bounded Files tab as Team sandbox when a device is selected", async () => {
  const context = fixture();
  enableDeviceComputer(context.client);
  const listDirectory = vi.fn(async () => ({
    status: "available" as const,
    entries: [],
    truncated: false,
  }));
  context.client.computers.get = async () => ({
    status: "available",
    computer: { ...computerRecord("running"), spaceId: agent.spaceId },
  });
  context.client.computers.listDirectory = listDirectory;
  context.client.computers.readFile = vi.fn();
  context.mount(true);
  await screen.findByRole("button", { name: "Computer: My machine · Connected" });
  await userEvent.click(screen.getByRole("tab", { name: "Files" }));
  expect(await screen.findByRole("heading", { name: "Team sandbox" })).toBeInTheDocument();
  await waitFor(() =>
    expect(listDirectory).toHaveBeenCalledWith({ spaceId: agent.spaceId, path: ".", limit: 100 }),
  );
});

it.each([
  [false, "loading"],
  [true, "loading"],
  [false, "error"],
  [true, "error"],
] as const)(
  "opens Computer controls without starting the sandbox while selection is %s %s",
  async (selected, scenario) => {
    const context = fixture();
    const { port, device, start } = enableDeviceComputer(context.client);
    const selection = { deviceId: device.id, grantId: device.grants[0]!.id };
    const pending = deferred<{ selection: DeviceComputerSelection }>();
    let recovered = false;
    port.getSelection = vi.fn(async () => {
      if (scenario === "loading") return pending.promise;
      if (!recovered) throw new Error("Fixture unavailable");
      return { selection };
    });
    context.mount(selected);
    const status = en.agents[scenario === "loading" ? "loading" : "computerUnavailable"];
    const name = selected ? `Computer context: ${status}` : `Computer: ${status}`;
    const chip = await screen.findByRole("button", { name });
    expect(chip).toBeEnabled();
    await userEvent.click(chip);
    const panel = await screen.findByRole("dialog", { name: "Team computer" });
    expect(start).not.toHaveBeenCalled();
    expect(within(panel).queryByRole("button", { name: "Start computer" })).not.toBeInTheDocument();
    const expectedAlert = scenario === "error" ? en.agents.devices.error : null;
    if (expectedAlert) await within(panel).findByRole("alert");
    expect(within(panel).queryByRole("alert")?.textContent ?? null).toBe(expectedAlert);
    if (scenario === "loading") {
      await act(async () => pending.resolve({ selection }));
    } else {
      recovered = true;
      await userEvent.click(within(panel).getByRole("button", { name: "Refresh" }));
    }
    await waitFor(() =>
      expect(within(panel).getByRole("combobox", { name: "Run computer" })).toHaveTextContent(
        "My machine",
      ),
    );
    expect(start).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh"] as const)(
  "keeps the composer usable while waiting, announces a request once and resolves it in %s",
  async (language) => {
    const strings = { en, zh }[language].agents;
    const request = approvalRequestSchema.parse({
      id: "request-one",
      spaceId: agent.spaceId,
      conversationId: conversation.id,
      runId: run.id,
      memberAccountId: "account",
      toolCallId: "call-one",
      toolName: "computer_write_file",
      arguments: { path: "notes.txt", content: "PRIVATE FILE BODY" },
      target: "notes.txt",
      argumentSummary: "Write 17 bytes",
      state: "pending",
      createdAt: time,
      expiresAt: "2100-01-01T00:00:00Z",
      resolvedAt: null,
      answeredByAccountId: null,
    });
    let finish: ((value: typeof request) => void) | undefined;
    const answer = vi.fn<ApprovalPort["answer"]>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const test = fixture({
      language,
      approvals: { pending: async () => [request], answer, effects: async () => [] },
      snapshot: {
        conversation,
        messages: [message],
        runs: [{ ...run, state: "waiting" }],
        segments: [],
        cursor: 3,
        toolActivity: [
          {
            runId: run.id,
            toolCallId: request.toolCallId,
            toolName: request.toolName,
            target: request.target,
            argumentSummary: request.argumentSummary,
            startedAt: time,
            finishedAt: null,
            outcome: null,
            durationMs: null,
            exitStatus: null,
          },
        ],
      },
    });
    test.mount(true);
    const approve = await screen.findByRole("button", { name: strings.approval.approve });
    expect(screen.getByRole("log")).not.toHaveTextContent("PRIVATE FILE BODY");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        language === "en" ? "Approval requested: Write a file" : "请求审批：写入文件",
      ),
    );
    const announcements: string[] = [];
    const live = screen.getByRole("status");
    const observer = new MutationObserver(() => announcements.push(live.textContent ?? ""));
    observer.observe(live, { childList: true, subtree: true, characterData: true });
    const editor = screen.getByRole("textbox", { name: strings.message });
    fireEvent.change(editor, { target: { value: "Keep chatting while waiting" } });
    expect(screen.getByRole("button", { name: strings.sendDuringReply })).toBeEnabled();
    expect(screen.queryByRole("button", { name: strings.stop })).not.toBeInTheDocument();
    expect(screen.getAllByText("notes.txt", { exact: true })).toHaveLength(1);
    expect(screen.getByRole("log").querySelector("[data-tool-call]")).toBeNull();
    fireEvent.click(approve);
    expect(approve).toBeDisabled();
    expect(screen.getByRole("button", { name: strings.approval.deny })).toBeDisabled();
    fireEvent.click(approve);
    expect(answer).toHaveBeenCalledTimes(1);
    await test.emit({
      type: "event",
      entry: {
        event: {
          kind: "card.resolved",
          spaceId: agent.spaceId,
          conversationId: conversation.id,
          sequence: 4,
          createdAt: time,
          requestId: request.id,
          toolCallId: request.toolCallId,
          runId: run.id,
          toolName: request.toolName,
          argumentSummary: request.argumentSummary,
          target: request.target,
          memberAccountId: request.memberAccountId,
          expiresAt: request.expiresAt,
          outcome: "approved",
          answeredByAccountId: "account",
        },
      },
    });
    await act(async () =>
      finish?.({
        ...request,
        state: "approved" as const,
        answeredByAccountId: "account",
        resolvedAt: time,
      }),
    );
    expect(
      screen.queryByRole("button", { name: strings.approval.approve }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("log").querySelector("[data-approval-card]")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(strings.approval.states.approved),
    );
    await test.emit({
      type: "event",
      entry: {
        event: {
          kind: "tool.finished",
          spaceId: agent.spaceId,
          conversationId: conversation.id,
          sequence: 5,
          createdAt: time,
          runId: run.id,
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          target: request.target,
          argumentSummary: request.argumentSummary,
          outcome: "succeeded",
          durationMs: 100,
          exitStatus: null,
        },
      },
    });
    const activity = screen.getByRole("log").querySelector("[data-tool-activity]")!;
    fireEvent.click(within(activity as HTMLElement).getByRole("button"));
    expect(
      within(activity as HTMLElement).getByText(strings.activity.outcomes.succeeded),
    ).toBeInTheDocument();
    expect(screen.getAllByText("notes.txt", { exact: true })).toHaveLength(1);
    expect(editor).toHaveValue("Keep chatting while waiting");
    expect(editor).toHaveFocus();
    await act(async () => {});
    expect(announcements).toEqual([strings.approval.states.approved]);
    observer.disconnect();
  },
);

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
  expect(within(dialog).getByText("No models are available.")).toBeInTheDocument();
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
  expect(within(dialog).getByText("No models are available.")).toBeInTheDocument();
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
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
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

it.each([
  ["en", "cancelled"],
  ["zh", "cancelled"],
  ["en", "waiting"],
  ["zh", "waiting"],
] as const)("shows the %s %s Run status once beside its steps", async (language, state) => {
  const strings = catalogs[language].agents;
  const test = fixture({
    language,
    snapshot: {
      conversation,
      messages: [message],
      runs: [{ ...run, state }],
      segments: [],
      cursor: 3,
      toolActivity: [
        {
          runId: run.id,
          toolCallId: "read-one",
          toolName: "computer_read_file",
          target: "notes.txt",
          argumentSummary: "Read note",
          startedAt: time,
          finishedAt: time,
          outcome: "succeeded",
          durationMs: 0,
          exitStatus: null,
        },
      ],
    },
  });
  test.mount(true);
  const log = await screen.findByRole("log");
  const status = strings[state];
  const steps = await within(log).findByRole("button", {
    name: language === "en" ? "1 step" : "1 个步骤",
  });
  expect(steps).toHaveTextContent(status);
  expect(steps).toHaveAccessibleDescription(status);
  expect(within(log).getAllByText(status)).toHaveLength(1);
  await userEvent.click(screen.getByRole("tab", { name: strings.activity.title }));
  const activity = screen.getByRole("tabpanel", { name: strings.activity.title });
  expect(within(activity).getAllByText(status)).toHaveLength(1);
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
  "truncates long %s Agent names in dense rows with accessible full names and a row menu",
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
    const target = await screen.findByRole("combobox", {
      name: catalogs[language].agents.workspaceHome.target,
    });
    expect(target).toHaveAttribute("title", name);
    expect(within(target).getByText(name)).toHaveClass("min-w-0", "truncate");
    expect(row.querySelector('[data-icon="inline-start"]')).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByRole("button", { name: catalogs[language].agents.workspaceHome.modelMenu }),
    ).toHaveTextContent("Fixture model");
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
  expect(screen.getByRole("heading", { level: 1, name: "Writing Agent" })).toHaveFocus();
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
  expect(within(log).queryByText("You")).not.toBeInTheDocument();
  expect(within(log).queryByText("Writing Agent")).not.toBeInTheDocument();
  expect(within(log).queryByText("Completed")).not.toBeInTheDocument();
  expect(screen.queryByText("Live")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
});

it("shows an empty Space with one create action and a selection state when Agents exist", async () => {
  const test = fixture({ items: [] });
  enableCapabilityTestPorts(test.client);
  const view = test.mount();
  await screen.findByText(en.agents.workspaceSidebar.emptyAgents);
  expect(screen.getByRole("button", { name: "Routines" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Routines" })).toHaveAccessibleDescription(
    en.agents.noAgents,
  );
  expect(screen.getAllByRole("button", { name: "Create Agent" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Create Agent" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  view.unmount();
  fixture().mount();
  expect(
    await screen.findByRole("heading", { name: en.agents.workspaceHome.heading }),
  ).toBeInTheDocument();
  expect(await screen.findByRole("textbox", { name: "Message" })).toBeInTheDocument();
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
      const title = screen.getByRole("heading", { level: 1, name });
      const bubble = pane.querySelector("[data-reply-bubble]")!;
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
        expect(pane.parentElement).toHaveClass("data-[orientation=horizontal]:flex-row");
        expect(pane.parentElement?.parentElement).toHaveClass("min-w-0", "flex-1");
        expect(title.parentElement).toHaveClass("min-w-0");
        expect(title).toHaveClass("min-w-0", "flex-1", "truncate");
        expect(title).toHaveAttribute("title", name);
        expect(trigger.parentElement).toHaveClass("shrink-0", "whitespace-nowrap");
        expect(trigger.parentElement).not.toHaveClass("truncate");
        expect(within(pane).queryByRole("heading", { level: 3, name })).not.toBeInTheDocument();
        expect(bubble.parentElement).toHaveClass("min-w-0", "w-full");
        expect(bubble).toHaveClass("min-w-0", "text-[15px]");
        expect(bubble).not.toHaveClass("border", "rounded-lg");
        expect(editor.closest("form")).toHaveClass("min-w-0");
      }
      expect(title).toHaveAccessibleName(name);
      expectShrinkableConversation();
      const initiallyOpen = width >= 1280;
      expect(trigger).toHaveAttribute("aria-expanded", String(initiallyOpen));
      if (initiallyOpen) fireEvent.click(trigger);
      await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
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
      expect(panel.classList.contains("data-[side=right]:data-starting-style:translate-x-0")).toBe(
        width < 1280,
      );
      expect(panel.classList.contains("data-[side=right]:data-ending-style:translate-x-0")).toBe(
        width < 1280,
      );
      expect(panel).not.toHaveClass("data-[side=right]:data-starting-style:translate-x-[2.5rem]");
      expect(panel).not.toHaveClass("data-[side=right]:data-ending-style:translate-x-[2.5rem]");
      expect(heading).toHaveFocus();
      expectShrinkableConversation();
      fireEvent.click(
        screen.getByRole("button", {
          name: language === "en" ? "Close computer panel" : "关闭电脑面板",
        }),
      );
      await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(title).toHaveAccessibleName(name);
      expectShrinkableConversation();
      view.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it.each(["en", "zh"] as const)(
  "keeps addressed approvals above the composer across reading tabs without blocking a message in %s",
  async (language) => {
    const request = approvalRequestSchema.parse({
      id: "pending-navigation",
      spaceId: agent.spaceId,
      conversationId: conversation.id,
      runId: run.id,
      memberAccountId: "account",
      toolCallId: "call",
      toolName: "computer_write_file",
      arguments: { path: "file.txt", content: "body" },
      target: "file.txt",
      argumentSummary: "Write file: file.txt",
      state: "pending",
      createdAt: time,
      expiresAt: "2100-01-01T00:00:00Z",
      resolvedAt: null,
      answeredByAccountId: null,
    });
    const test = fixture({
      language,
      approvals: { pending: async () => [request], answer: vi.fn(), effects: async () => [] },
    });
    const view = test.mount(true);
    const strings = { en, zh }[language].agents;
    const approve = await screen.findByRole("button", { name: strings.approval.approve });
    const card = approve.closest("[data-approval-card]")!;
    const band = view.container.querySelector("[data-pending-approvals]")!;
    expect(band).toContainElement(card as HTMLElement);
    expect(band).toHaveClass("min-w-0", "overflow-y-auto");
    expect(screen.getByRole("log")).not.toContainElement(card as HTMLElement);
    const editor = screen.getByRole("textbox", { name: strings.message });
    expect(band.parentElement).toContainElement(editor);
    fireEvent.click(screen.getByRole("tab", { name: strings.activity.title }));
    expect(approve).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: strings.files.title }));
    expect(approve).toBeVisible();
    expect(view.container.querySelectorAll("[data-approval-card]")).toHaveLength(1);
    fireEvent.change(editor, { target: { value: "Keep working while approval waits" } });
    expect(screen.getByRole("button", { name: strings.send })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: strings.send }));
    await waitFor(() => expect(test.send).toHaveBeenCalledOnce());
    expect(approve).toBeVisible();
  },
);

function pendingProtectedInput(conversationId: string = conversation.id) {
  return protectedInputRequestSchema.parse({
    id: crypto.randomUUID(),
    spaceId: agent.spaceId,
    conversationId,
    runId: run.id,
    memberAccountId: "account",
    toolCallId: "protected-call",
    toolName: "computer_run_command",
    target: ".",
    input: {
      name: "Access token",
      purpose: "Authenticate once",
      destination: { kind: "environment", variable: "TOKEN" },
    },
    untrustedInput: false,
    provenanceKind: null,
    state: "pending",
    createdAt: time,
    expiresAt: "2100-01-01T00:00:00Z",
    resolvedAt: null,
  });
}

it.each(["en", "zh"] as const)(
  "keeps a single masked request beside the composer across reading tabs and scoped to its conversation in %s",
  async (language) => {
    const request = pendingProtectedInput();
    const otherRequest = pendingProtectedInput("another-conversation");
    const test = fixture({ language });
    test.client.protectedInputs = {
      pending: vi.fn(async () => [request, otherRequest]),
      answer: vi.fn(),
    };
    const view = test.mount(true);
    const strings = { en, zh }[language].agents;
    const label = strings.protectedInput.title.replace("{name}", request.input.name);
    const input = await screen.findByLabelText(label);
    const card = input.closest("[data-protected-input]");
    const editor = await screen.findByRole("textbox", { name: strings.message });
    expect(input).toHaveAttribute("type", "password");
    expect(card?.parentElement?.parentElement).toContainElement(editor);
    expect(screen.getByRole("log")).not.toContainElement(input);
    const value = crypto.randomUUID();
    fireEvent.change(input, { target: { value } });
    for (const tab of [strings.activity.title, strings.files.title, strings.conversation]) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      expect(input).toBeVisible();
      expect(input).toHaveValue(value);
      expect(view.container.querySelectorAll("[data-protected-input]")).toHaveLength(1);
    }
    fireEvent.change(editor, { target: { value: "Continue the conversation" } });
    fireEvent.click(screen.getByRole("button", { name: strings.send }));
    await waitFor(() => expect(test.send).toHaveBeenCalledOnce());
    expect([...test.storage.values()].join("")).not.toContain(value);
    view.unmount();
    expect(input).toHaveValue("");
  },
);

it.each(["home", "pages"] as const)(
  "keeps Space-wide protected requests reachable on %s without duplicate forms",
  async (surface) => {
    const request = pendingProtectedInput();
    const otherRequest = pendingProtectedInput("another-conversation");
    const test = fixture();
    test.client.protectedInputs = {
      pending: vi.fn(async () => [request, otherRequest]),
      answer: vi.fn(),
    };
    const renderWorkspace = surface === "pages" ? () => <main>Page workspace</main> : undefined;
    const view = test.mount(false, undefined, undefined, undefined, renderWorkspace);
    await waitFor(() =>
      expect(view.container.querySelectorAll("[data-protected-input]")).toHaveLength(2),
    );
    expect(view.container.querySelectorAll("input[type=password]")).toHaveLength(2);
  },
);

it("clears a home protected value when entering a conversation without duplicating the form", async () => {
  const request = pendingProtectedInput();
  const test = fixture();
  test.client.protectedInputs = {
    pending: vi.fn(async () => [request]),
    answer: vi.fn(),
  };
  const view = test.mount();
  const input = await screen.findByLabelText("Protected input: Access token");
  fireEvent.change(input, { target: { value: crypto.randomUUID() } });
  fireEvent.click(screen.getByRole("button", { name: agent.name }));
  await screen.findByRole("log");
  expect(input).toHaveValue("");
  await waitFor(() =>
    expect(view.container.querySelectorAll("[data-protected-input]")).toHaveLength(1),
  );
  expect(screen.getByLabelText("Protected input: Access token")).toHaveValue("");
});

it.each(["queued", "running", "waiting"] as const)(
  "uses one primary composer action while %s and preserves keyboard behavior",
  async (state) => {
    const test = fixture({
      snapshot: {
        conversation,
        messages: [message],
        runs: [{ ...run, state }],
        segments: [],
        cursor: 3,
      },
    });
    test.mount(true);
    const stop = await screen.findByRole("button", { name: "Stop reply" });
    expect(stop).toHaveClass("bg-primary", "text-primary-foreground");
    const editor = screen.getByRole("textbox", { name: "Message" });
    const form = editor.closest("form")!;
    expect(
      within(form)
        .getAllByRole("button")
        .filter((button) => button.classList.contains("bg-primary")),
    ).toHaveLength(1);
    fireEvent.change(editor, { target: { value: "More detail" } });
    const send = await screen.findByRole("button", { name: "Send message during reply" });
    expect(send).toBeEnabled();
    expect(
      within(form)
        .getAllByRole("button")
        .filter((button) => button.classList.contains("bg-primary")),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Stop reply" })).not.toBeInTheDocument();
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
    fireEvent.compositionStart(editor);
    fireEvent.keyDown(editor, { key: "Enter" });
    fireEvent.compositionEnd(editor);
    fireEvent.keyDown(editor, { key: "Enter", keyCode: 229 });
    expect(test.send).not.toHaveBeenCalled();
    fireEvent.change(editor, { target: { value: " " } });
    expect(await screen.findByRole("button", { name: "Stop reply" })).toBeEnabled();
    fireEvent.change(editor, { target: { value: "More detail" } });
    expect(await screen.findByRole("button", { name: "Send message during reply" })).toBeEnabled();
    fireEvent.keyDown(editor, { key: "Enter" });
    await waitFor(() => expect(test.send).toHaveBeenCalledOnce());
    expect(test.send).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.objectContaining({ text: "More detail" }) }),
    );
    expect(editor).toHaveFocus();
  },
);

it.each(["en", "zh"] as const)(
  "supports sender context while direct single-member conversations omit labels in %s",
  async (language) => {
    const strings = { en, zh }[language].agents;
    const test = fixture({
      snapshot: {
        conversation,
        messages: [message],
        runs: [{ ...run, state: "succeeded" }],
        segments: [
          {
            id: "segment",
            spaceId: agent.spaceId,
            conversationId: conversation.id,
            runId: run.id,
            sequence: 3,
            text: "Short answer",
            createdAt: time,
          },
        ],
        cursor: 3,
      },
    });
    const props = {
      item: { agent, conversation },
      port: test.client.conversations,
      computerPort: test.client.computers,
      socket: test.socket,
      drafts: test.drafts,
      origin: "https://example.test",
      accountId: "account",
    };
    function contents(showAgentNames: boolean, hasOtherMembers: boolean) {
      return (
        <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
          <AgentConversation
            {...props}
            showAgentNames={showAgentNames}
            hasOtherMembers={hasOtherMembers}
          />
        </BrowserLanguageProvider>
      );
    }
    const view = render(contents(false, false));
    await screen.findByText("Short answer");
    const log = screen.getByRole("log");
    expect(within(log).queryByRole("heading")).not.toBeInTheDocument();
    const bubble = log.querySelector("[data-reply-bubble]")!;
    expect(bubble.parentElement).toHaveClass("w-full", "min-w-0");
    expect(bubble).not.toHaveClass("border");
    expect(log.firstElementChild).toHaveClass("gap-4", "max-w-[44rem]");
    expect(screen.getAllByRole("heading", { name: agent.name })).toHaveLength(1);
    view.rerender(contents(true, true));
    expect(within(log).getByRole("heading", { name: agent.name })).toBeInTheDocument();
    expect(within(log).getByRole("heading", { name: strings.you })).toBeInTheDocument();
  },
);

it("keeps an exchange tight and separates the next member turn", async () => {
  const nextMessage = {
    ...message,
    id: messageSchema.shape.id.parse("next-message"),
    sequence: 5,
    text: "Next exchange",
  };
  const nextRun = {
    ...run,
    id: runSchema.shape.id.parse("next-run"),
    messageId: nextMessage.id,
    state: "succeeded" as const,
  };
  const test = fixture({
    snapshot: {
      conversation,
      messages: [message, nextMessage],
      runs: [{ ...run, state: "succeeded" }, nextRun],
      cursor: 8,
      segments: [run, nextRun].map((value, index) => ({
        id: `segment-${index}`,
        spaceId: agent.spaceId,
        conversationId: conversation.id,
        runId: value.id,
        sequence: 4 + index * 4,
        text: `Answer ${index}`,
        createdAt: time,
      })),
    },
  });
  test.mount(true);
  await screen.findByText("Answer 1");
  expect(screen.getByText("Hello Agent").closest("article")).not.toHaveClass("mt-4");
  expect(screen.getByText("Next exchange").closest("article")).toHaveClass("mt-4");
  expect(screen.getByRole("log").firstElementChild).toHaveClass("gap-4", "max-w-[44rem]");
});

it.each([
  { trigger: "routine" as const, kind: null, label: "Routine", untrusted: false },
  { trigger: "webhook" as const, kind: "webhook" as const, label: "Webhook", untrusted: true },
  { trigger: "email" as const, kind: "email" as const, label: "Email", untrusted: true },
  {
    trigger: "webhook" as const,
    kind: "repository" as const,
    label: "Repository event",
    untrusted: true,
  },
])("shows $label origin from server metadata", async ({ trigger, kind, label, untrusted }) => {
  const test = fixture({
    snapshot: {
      conversation,
      messages: [message],
      runs: [
        {
          ...run,
          trigger,
          inboundProvenance: kind ? { kind, routineId: "routine", deliveryId: "delivery" } : null,
        },
      ],
      segments: [],
      cursor: 2,
    },
  });
  test.mount(true);
  expect(await screen.findByText(label, { selector: "[data-run-origin]" })).toBeVisible();
  expect(screen.queryByText("This Run received untrusted external input.") !== null).toBe(
    untrusted,
  );
});

function HeaderTestLink({
  to,
  markActive: _active,
  exact: _exact,
  children,
  ...props
}: ShellLinkProps<string>) {
  return (
    <a href={to} {...props}>
      {children}
    </a>
  );
}

it.each(
  (["document", "window"] as const).flatMap((frame) =>
    (["en", "zh"] as const).flatMap((language) =>
      [375, 1024, 1280, 1440].map((width) => ({ frame, language, width })),
    ),
  ),
)(
  "keeps the portaled $frame title, tabs and capability controls shrinkable at $width px with a long $language name",
  async ({ frame, language, width }) => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => {
        const rule = query.match(/\((min|max)-width: (\d+)px\)/);
        let matches = false;
        if (rule) matches = rule[1] === "min" ? width >= Number(rule[2]) : width <= Number(rule[2]);
        return { matches, media: query, addEventListener() {}, removeEventListener() {} };
      }),
    );
    try {
      const strings = { en, zh }[language].agents;
      const name =
        language === "en"
          ? "A long English Agent name for the conversation header ".repeat(3).trim()
          : "用于检查会话标题栏布局的很长的中文智能体名称".repeat(4);
      const context = fixture({ language, items: [{ agent: { ...agent, name }, conversation }] });
      enableCapabilityTestPorts(context.client);
      await act(async () => {
        context.mount(true, frame);
      });
      const title = await screen.findByRole("heading", { name, level: 1 });
      const header = title.parentElement!;
      const actions = header.querySelector("[data-conversation-actions]")!;
      expect(header.closest("header[data-frame]")).toHaveAttribute("data-frame", frame);
      expect(header).toHaveClass("h-full", "min-w-0", "flex-row", "flex-wrap", "sm:flex-nowrap");
      expect(header).toContainElement(title);
      expect(header).toContainElement(actions as HTMLElement);
      const tabs = within(header).getByRole("tablist", { name: strings.conversationViews });
      expect(tabs).toHaveClass("order-last", "basis-full", "sm:basis-auto");
      for (const label of [strings.conversation, strings.activity.title, strings.files.title])
        expect(within(tabs).getByRole("tab", { name: label })).toBeInTheDocument();
      expect(title).toHaveClass("min-w-0", "flex-1", "truncate");
      expect(title).not.toHaveClass("shrink-0");
      expect(title).toHaveAttribute("title", name);
      expect(actions).toHaveClass(
        "shrink-0",
        "flex-row",
        "flex-nowrap",
        "items-center",
        "whitespace-nowrap",
      );
      for (const child of actions.children) expect(child).toHaveClass("shrink-0");
      for (const button of actions.querySelectorAll("button"))
        expect(button).toHaveClass("shrink-0");
      expect(
        within(header).getByRole("button", {
          name: strings.computerIndicator.replace("{state}", strings.computerNotConfigured),
        }),
      ).not.toHaveClass("truncate");
      expect(header.querySelector("[data-capability-inline]")).toBeNull();
      const menu = within(header).getByRole("button", { name: strings.conversationActions });
      expect(menu.parentElement).toHaveClass("shrink-0");
      expect(menu.parentElement).not.toHaveClass("sm:hidden");
      for (const node of [header, actions]) expect(node.className).not.toMatch(/@[^ ]*\/main/);
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

function enableCapabilityTestPorts(client: AgentsWorkspacePort) {
  const unused = async () => {
    throw new Error("Unexpected capability request");
  };
  client.routines = {
    list: unused,
    get: unused,
    create: unused,
    update: unused,
    pause: unused,
    resume: unused,
    delete: unused,
    test: unused,
    rotateWebhookKey: unused,
    history: unused,
    events: unused,
  };
  client.spaceMemory = {
    list: unused,
    get: unused,
    create: unused,
    update: unused,
    remove: unused,
    history: unused,
    restore: unused,
  };
}

it.each(
  (["routines", "memory", "computer"] as const).flatMap((kind) =>
    (["inline", "menu"] as const).flatMap((opener) =>
      [false, true].map((resize) => ({ kind, opener, resize })),
    ),
  ),
)(
  "closes $kind with one Escape from its focused close tooltip after $opener opening (resize=$resize)",
  async ({ kind, opener, resize }) => {
    let width = opener === "menu" ? 375 : 1024;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(min-width: 640px)" && width >= 640,
        media: query,
        addEventListener(_type: string, listener: () => void) {
          listeners.add(listener);
        },
        removeEventListener(_type: string, listener: () => void) {
          listeners.delete(listener);
        },
      })),
    );
    try {
      const context = fixture();
      enableCapabilityTestPorts(context.client);
      const user = userEvent.setup();
      context.mount(true);
      const computer = await screen.findByRole("button", {
        name: "Computer: Not configured on this server",
      });
      const names = { routines: "Routines", memory: "Memory", computer: "Team computer" };
      const inlineNames = {
        routines: "Routines",
        memory: "Memory",
        computer: "Computer: Not configured on this server",
      };
      const inline =
        kind === "computer" ? screen.getByRole("button", { name: inlineNames[kind] }) : null;
      const menu = screen.getByRole("button", { name: "Conversation actions" });
      const fromMenu = opener === "menu" || kind !== "computer";
      if (fromMenu) {
        await user.click(menu);
        await user.click(await screen.findByRole("menuitem", { name: names[kind] }));
      } else await user.click(inline!);
      const sheet = await screen.findByRole("dialog", { name: names[kind] });
      await waitFor(() =>
        expect(within(sheet).getByRole("heading", { name: names[kind] })).toHaveFocus(),
      );
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      if (resize)
        await act(async () => {
          width = width < 640 ? 1024 : 375;
          for (const listener of listeners) listener();
        });
      const closeLabel = kind === "computer" ? "Close computer panel" : "Close panel";
      const close = within(sheet).getByRole("button", { name: closeLabel });
      await act(async () => {
        close.focus();
      });
      await user.hover(close);
      expect(await screen.findByRole("tooltip", { name: closeLabel })).toBeVisible();
      expect(close).toHaveFocus();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: names[kind] })).toBeNull());
      const returnTo = fromMenu ? menu : inline;
      await waitFor(() => expect(returnTo).toHaveFocus());
      expect(computer).toHaveAttribute("aria-expanded", "false");
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it.each(["removed", "deleting"] as const)(
  "closes a %s Space immediately and keeps a later user choice when exit discovery finishes",
  async (reason) => {
    const two = {
      space: {
        ...membership.space,
        id: spaceSchema.shape.id.parse("space-two"),
        name: "Second Space",
      },
      member: { ...membership.member, spaceId: spaceSchema.shape.id.parse("space-two") },
    };
    const three = {
      space: {
        ...membership.space,
        id: spaceSchema.shape.id.parse("space-three"),
        name: "Third Space",
      },
      member: { ...membership.member, spaceId: spaceSchema.shape.id.parse("space-three") },
    };
    let memberships = [membership, two, three];
    const context = fixture({ memberships });
    const list = vi.fn(async () => memberships);
    context.client.spaces.list = list;
    context.client.agents.list = async ({ spaceId }) =>
      spaceId === membership.space.id ? [{ agent, conversation }] : [];
    const unused = async () => {
      throw new Error("Unexpected Space operation");
    };
    let acknowledgeDeletion!: (value: Awaited<ReturnType<SpaceManagementPort["delete"]>>) => void;
    const deleteSpace = vi.fn<SpaceManagementPort["delete"]>(
      () =>
        new Promise((resolve) => {
          acknowledgeDeletion = resolve;
        }),
    );
    const management: SpaceManagementPort = {
      get: async ({ spaceId }) => memberships.find((entry) => entry.space.id === spaceId)!.space,
      members: async ({ spaceId }) => [
        {
          ...memberships.find((entry) => entry.space.id === spaceId)!.member,
          name: "Viewer",
          image: null,
        },
      ],
      settings: async ({ spaceId }) => ({ spaceId, approvalMode: null, updatedAt: null }),
      invitations: async () => [],
      rename: unused,
      delete: deleteSpace,
      leave: unused,
      updateMemberRole: unused,
      removeMember: unused,
      createInvitation: unused,
      cancelInvitation: unused,
      cancelInvitations: unused,
      previewInvitation: unused,
      acceptInvitation: unused,
      setApprovalOverride: unused,
      clearApprovalOverride: unused,
      audit: unused,
      events: unused,
    };
    context.client.spaceManagement = management;
    const connections: Array<{
      callbacks: Parameters<ConversationSocketPort["connect"]>[0];
      sent: unknown[];
    }> = [];
    context.socket.connect = (callbacks) => {
      const sent: unknown[] = [];
      connections.push({ callbacks, sent });
      queueMicrotask(() => callbacks.onFrame({ type: "ready", version: 1 }));
      return { send: (value) => sent.push(value), close() {} };
    };
    const onNavigate = vi.fn();
    await act(async () => {
      context.mount(true, "document", onNavigate);
    });
    await screen.findByRole("button", { name: "Computer: Not configured on this server" });
    await waitFor(() =>
      expect(
        connections.some(({ sent }) =>
          sent.some((value) => JSON.stringify(value).includes('"type":"space.subscribe"')),
        ),
      ).toBe(true),
    );
    const live = connections.find(({ sent }) =>
      sent.some((value) => JSON.stringify(value).includes('"type":"space.subscribe"')),
    )!;
    const user = userEvent.setup();
    if (reason === "deleting") {
      await user.click(screen.getByRole("button", { name: "Space" }));
      await user.click(
        await screen.findByRole("menuitem", { name: en.agents.spaceSettings.title }),
      );
      const settings = await screen.findByRole("dialog", { name: en.agents.spaceSettings.title });
      await user.click(
        within(settings).getByRole("button", { name: en.agents.spaceSettings.delete }),
      );
      const title = en.agents.spaceSettings.deleteTitle.replace("{name}", membership.space.name);
      const confirmation = await screen.findByRole("dialog", { name: title });
      const prompt = en.agents.spaceSettings.typeName.replace("{name}", membership.space.name);
      await user.type(
        within(confirmation).getByRole("textbox", { name: prompt }),
        membership.space.name,
      );
      await user.click(
        within(confirmation).getByRole("button", { name: en.agents.spaceSettings.delete }),
      );
    }
    await waitFor(() => expect(deleteSpace).toHaveBeenCalledTimes(reason === "deleting" ? 1 : 0));
    let finish!: (value: typeof memberships) => void;
    if (reason === "deleting") list.mockResolvedValueOnce([two, three]);
    list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    memberships = [two, three];
    await act(async () => {
      if (reason === "deleting") live.callbacks.onClose(4003);
      else
        live.callbacks.onFrame({
          type: "space.event",
          spaceId: membership.space.id,
          event: {
            id: 1,
            spaceId: membership.space.id,
            kind: "space.member.removed",
            payload: { accountId: "account" },
            createdAt: "2026-11-14T03:00:00Z",
          },
        });
    });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith({ spaceId: two.space.id }));
    expect(
      screen.queryByRole("button", { name: "Computer: Not configured on this server" }),
    ).toBeNull();
    const initialExit =
      reason === "deleting"
        ? en.agents.spaceSettings.exitUnavailable
        : en.agents.spaceSettings.exitRemoved;
    expect(await screen.findByText(initialExit)).toBeVisible();
    if (reason === "deleting") {
      await act(async () => {
        acknowledgeDeletion({ spaceId: membership.space.id, status: "deleting" });
      });
    }
    const confirmedExit =
      reason === "deleting"
        ? en.agents.spaceSettings.exitDeleted
        : en.agents.spaceSettings.exitRemoved;
    expect(await screen.findByText(confirmedExit)).toBeVisible();
    const switcher = await screen.findByRole("button", { name: "Space" });
    await waitFor(() => expect(switcher).toBeEnabled());
    await user.click(switcher);
    await user.click(await screen.findByRole("menuitemradio", { name: three.space.name }));
    expect(onNavigate).toHaveBeenLastCalledWith({ spaceId: three.space.id });
    await act(async () => {
      finish(memberships);
    });
    expect(onNavigate).toHaveBeenLastCalledWith({ spaceId: three.space.id });
    expect(screen.getByRole("button", { name: "Space" })).toHaveTextContent(three.space.name);
  },
);
it.each(["en", "zh"] as const)(
  "keeps one clear Create Agent path as the empty sidebar collapses (%s)",
  async (language) => {
    const f = fixture({ items: [], language });
    f.client.groups = {
      listGroups: async () => [],
      createGroup: vi.fn(),
      getGroup: vi.fn(),
      renameGroup: vi.fn(),
      addGroupAgent: vi.fn(),
      removeGroupAgent: vi.fn(),
      deleteGroup: vi.fn(),
    };
    const copy = catalogs[language].agents;
    const common = catalogs[language].common;
    await act(async () => {
      f.mount(false, "document");
    });
    await screen.findByText(copy.workspaceSidebar.emptyAgents);
    const sidebar = screen.getByRole("complementary");
    const sidebarCreate = within(sidebar).getByRole("button", { name: copy.createAgent });
    const secondary = within(sidebar).getByRole("button", { name: copy.groups.new });
    expect(screen.getAllByRole("button", { name: copy.createAgent })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: copy.groups.new })).toHaveLength(1);
    expect(sidebarCreate).not.toHaveClass("bg-primary");
    expect(secondary).not.toHaveClass("bg-primary");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: common.collapseSidebar }));
    expect(sidebarCreate).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: copy.createAgent })).toBeNull();
    const primary = within(screen.getByRole("main")).getByRole("button", {
      name: copy.createAgent,
    });
    expect(screen.getAllByRole("button", { name: copy.createAgent })).toHaveLength(1);
    expect(primary).toHaveClass("bg-primary");
    expect(secondary).toBeVisible();
    for (const opener of [primary, secondary]) {
      await user.click(opener);
      await screen.findByRole("dialog", {
        name: opener === primary ? copy.newAgent : copy.groups.new,
      });
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(opener).toHaveFocus());
    }
    expect(f.create).not.toHaveBeenCalled();
  },
);

it("appends a Page reference once to the restored draft without sending", async () => {
  const test = fixture();
  const first = test.mount(true);
  const editor = await screen.findByRole("textbox", { name: "Message" });
  fireEvent.change(editor, { target: { value: "My unsent question" } });
  first.unmount();
  const reference = { id: "page-one", text: "Page: Project notes (page-one)" };
  const second = test.mount(true, undefined, undefined, reference);
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue(
      "My unsent question\n\nPage: Project notes (page-one)",
    ),
  );
  expect(test.send).not.toHaveBeenCalled();
  second.unmount();
  test.mount(true, undefined, undefined, reference);
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue(
      "My unsent question\n\nPage: Project notes (page-one)",
    ),
  );
  expect(test.send).not.toHaveBeenCalled();
});

it("keeps intended capabilities after partial creation failure and retries the same Agent", async () => {
  const { skillSchema } = await import("@raypx/core/skills");
  const { mcpServerSchema } = await import("@raypx/core/mcp-servers");
  const test = fixture();
  const createdAgent = agentSchema.parse({
    ...agent,
    id: "created-agent",
    name: "Capability Agent",
  });
  const createdConversation = conversationSchema.parse({
    ...conversation,
    id: "created-conversation",
    agentId: createdAgent.id,
  });
  const skill = skillSchema.parse({
    id: "notes",
    name: "Notes skill",
    description: "Notes",
    body: "# Notes",
    ownership: "account",
    spaceId: null,
    agentId: null,
    availability: { mode: "all" },
    createdAt: time,
    updatedAt: time,
  });
  const server = mcpServerSchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    name: "Research server",
    url: "https://example.com/mcp",
    transport: "http",
    availability: { mode: "all" },
    hasCredentials: false,
    createdAt: time,
    updatedAt: time,
  });
  const setSkills = vi.fn(async () => [skill]);
  const enabledSkills = vi.fn(async () => []);
  const setServers = vi
    .fn<NonNullable<AgentsWorkspacePort["mcpServers"]>["setEnabled"]>()
    .mockRejectedValueOnce(new Error("REQUEST_FAILED"))
    .mockResolvedValueOnce([server.id]);
  const enabledServers = vi.fn(async () => []);
  test.client.skills = {
    list: async () => [skill],
    agentSkills: enabledSkills,
    setAgentSkills: setSkills,
  };
  test.client.mcpServers = {
    list: async () => [server],
    enabled: enabledServers,
    setEnabled: setServers,
  };
  test.create.mockResolvedValue({ agent: createdAgent, conversation: createdConversation });
  test.update.mockImplementation(async ({ agent: input }) => ({
    agent: { ...createdAgent, ...input },
    conversation: createdConversation,
  }));
  test.readSnapshot.mockResolvedValue({
    conversation: createdConversation,
    messages: [],
    runs: [],
    segments: [],
    cursor: 0,
  });
  test.mount();
  fireEvent.click(await screen.findByRole("button", { name: "New Agent" }));
  const dialog = await screen.findByRole("dialog", { name: "New Agent" });
  const skillCheckbox = await within(dialog).findByRole("checkbox", { name: "Notes skill" });
  const serverCheckbox = within(dialog).getByRole("checkbox", { name: "Research server" });
  fireEvent.change(within(dialog).getByLabelText("Name"), {
    target: { value: "Capability Agent" },
  });
  fireEvent.click(skillCheckbox);
  fireEvent.click(serverCheckbox);
  fireEvent.click(within(dialog).getByRole("button", { name: "Create Agent" }));
  await waitFor(() =>
    expect(within(dialog).getByRole("alert")).toHaveTextContent(en.agents.saveError),
  );
  expect(skillCheckbox).toBeChecked();
  expect(serverCheckbox).toBeChecked();
  expect(enabledSkills).not.toHaveBeenCalled();
  expect(enabledServers).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(test.create).toHaveBeenCalledTimes(1);
  expect(test.update).toHaveBeenCalledExactlyOnceWith({
    spaceId: agent.spaceId,
    id: createdAgent.id,
    agent: expect.objectContaining({ name: "Capability Agent" }),
  });
  expect(setSkills).toHaveBeenCalledTimes(2);
  expect(setSkills).toHaveBeenNthCalledWith(2, {
    spaceId: agent.spaceId,
    agentId: createdAgent.id,
    ids: [skill.id],
  });
  expect(setServers).toHaveBeenCalledTimes(2);
  expect(setServers).toHaveBeenNthCalledWith(2, {
    spaceId: agent.spaceId,
    agentId: createdAgent.id,
    serverIds: [server.id],
  });
});

it("keeps a newer Agent form open when a dismissed creation finishes", async () => {
  const user = userEvent.setup();
  const test = fixture();
  let complete!: (value: AgentConversationView) => void;
  test.create.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  test.mount();
  fireEvent.click(await screen.findByRole("button", { name: "New Agent" }));
  const first = await screen.findByRole("dialog", { name: "New Agent" });
  fireEvent.change(within(first).getByLabelText("Name"), { target: { value: "First Agent" } });
  fireEvent.click(within(first).getByRole("button", { name: "Create Agent" }));
  await waitFor(() => expect(test.create).toHaveBeenCalledTimes(1));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "New Agent" }));
  const second = await screen.findByRole("dialog", { name: "New Agent" });
  fireEvent.change(within(second).getByLabelText("Name"), {
    target: { value: "Keep this new draft" },
  });
  await act(async () => complete({ agent: { ...agent, name: "First Agent" }, conversation }));
  expect(screen.getByRole("dialog", { name: "New Agent" })).toBeVisible();
  expect(within(second).getByLabelText("Name")).toHaveValue("Keep this new draft");
  expect(within(second).getByRole("button", { name: "Create Agent" })).toBeEnabled();
  expect(test.update).not.toHaveBeenCalled();
});

it.each(["en", "zh"] as const)(
  "loads earlier windows without moving the reading message in %s",
  async (language) => {
    const strings = catalogs[language].agents;
    const entries = Array.from({ length: 60 }, (_, index) => ({
      ...message,
      id: messageSchema.shape.id.parse(`history-${index + 1}`),
      sequence: index + 1,
      text: `History ${index + 1}`,
    }));
    const test = fixture({ language });
    const history = vi.fn(async ({ before }: { before?: { beforeSequence: number } }) => ({
      conversation,
      messages: before ? entries.slice(0, 30) : entries.slice(30),
      runs: [],
      segments: [],
      cursor: 60,
      olderCursor: before
        ? null
        : { spaceId: agent.spaceId, conversationId: conversation.id, beforeSequence: 31 },
      runsTruncated: false,
      segmentsTruncated: false,
    }));
    test.client.conversations.history = history;
    test.mount(true);
    const line = await screen.findByText("History 34");
    expect(screen.queryByText("History 1", { exact: true })).not.toBeInTheDocument();
    const log = screen.getByRole("log");
    Object.defineProperties(log, {
      clientHeight: { value: 200 },
      scrollHeight: { get: () => log.querySelectorAll("[data-message-id]").length * 40 },
    });
    vi.spyOn(log, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 200,
      height: 200,
      width: 600,
      left: 0,
      right: 600,
      x: 0,
      y: 0,
      toJSON() {},
    });
    for (const row of log.querySelectorAll<HTMLElement>("[data-message-id]")) {
      vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => {
        const top =
          [...log.querySelectorAll("[data-message-id]")].indexOf(row) * 40 - log.scrollTop;
        return {
          top,
          bottom: top + 40,
          height: 40,
          left: 0,
          right: 600,
          width: 600,
          x: 0,
          y: top,
          toJSON() {},
        };
      });
    }
    log.scrollTop = 120;
    fireEvent.scroll(log);
    const anchor = line.closest<HTMLElement>("[data-message-id]")!;
    const offset = anchor.getBoundingClientRect().top;
    await userEvent.click(screen.getByRole("button", { name: strings.history.earlier }));
    await screen.findByText("History 1", { exact: true });
    expect(screen.getByText("History 34").closest("[data-message-id]")).toBe(anchor);
    expect(anchor.getBoundingClientRect().top).toBe(offset);
    expect(log).toHaveAttribute("data-history-count", "60");
    expect(screen.getByText(strings.history.start)).toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(2);
  },
);

it.each(["en", "zh"] as const)(
  "restores historical names and resolved answerers from snapshot in %s",
  async (language) => {
    const strings = catalogs[language].agents;
    const departed = { ...message, author: { kind: "member" as const, accountId: "departed" } };
    const test = fixture({
      language,
      snapshot: {
        conversation,
        messages: [departed],
        runs: [{ ...run, state: "succeeded" }],
        segments: [],
        cursor: 6,
        participants: [
          { accountId: "departed", displayName: "Mei", isMember: false },
          { accountId: "account", displayName: "Alex", isMember: true },
        ],
        resolvedApprovals: [
          {
            requestId: "answered",
            runId: run.id,
            toolCallId: "historical-tool",
            outcome: "approved",
            answeredByAccountId: "departed",
            resolvedAt: time,
          },
        ],
        toolActivity: [
          {
            runId: run.id,
            toolCallId: "historical-tool",
            toolName: "computer_write_file",
            target: "old.txt",
            argumentSummary: "Write",
            startedAt: time,
            finishedAt: time,
            outcome: "succeeded",
            durationMs: 5,
            exitStatus: null,
          },
        ],
      },
    });
    test.mount(true);
    const name = strings.departedMember.replace("{name}", "Mei");
    expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
    const activity = await screen.findByRole("button", { name: /1/ });
    fireEvent.click(activity);
    expect(
      await screen.findByText(strings.spaceSettings.approvedBy.replace("{name}", name)),
    ).toBeInTheDocument();
  },
);

it.each(["en", "zh"] as const)(
  "keeps old active work actionable outside history in %s",
  async (language) => {
    const request = approvalRequestSchema.parse({
      id: "old-approval",
      spaceId: agent.spaceId,
      conversationId: conversation.id,
      runId: run.id,
      memberAccountId: "account",
      toolCallId: "write",
      toolName: "computer_write_file",
      arguments: { path: "report.txt", text: "private body" },
      argumentSummary: "Write file",
      target: "report.txt",
      state: "pending",
      createdAt: time,
      expiresAt: "2099-11-14T00:00:00Z",
      resolvedAt: null,
      answeredByAccountId: null,
    });
    const approvalPort: ApprovalPort = {
      pending: async () => [request],
      effects: async () => [],
      answer: vi.fn(async () => ({
        ...request,
        state: "approved" as const,
        resolvedAt: time,
        answeredByAccountId: "account",
      })),
    };
    const f = fixture({ language, approvals: approvalPort });
    const recentMessage = {
      ...message,
      id: messageSchema.shape.id.parse("recent"),
      sequence: 100,
      text: "Recent message",
    };
    const active = {
      run: { ...run, state: "waiting" as const, untrustedInput: true, computerInputPaused: true },
      triggerMessage: { id: message.id, sequence: 1 },
      pendingApprovals: [
        {
          requestId: request.id,
          runId: run.id,
          toolCallId: "write",
          toolName: request.toolName,
          argumentSummary: "Write file",
          target: "report.txt",
          memberAccountId: "account",
          createdAt: time,
          expiresAt: request.expiresAt,
        },
      ],
      pendingApprovalsTruncated: false,
      latestCommittedSegment: null,
    };
    f.client.conversations.history = vi.fn(async (input) => ({
      conversation,
      messages: input.before ? [message] : [recentMessage],
      runs: input.before ? [active.run] : [],
      segments: [],
      cursor: 100,
      olderCursor: input.before
        ? null
        : { spaceId: agent.spaceId, conversationId: conversation.id, beforeSequence: 100 },
      runsTruncated: false,
      segmentsTruncated: false,
      activeRuns: [active],
      activeRunsTruncated: false,
    }));
    f.mount(true);
    const strip = await screen.findByRole("region", {
      name: language === "en" ? "Still working" : "仍在工作",
    });
    expect(within(strip).getByText(agent.name)).toBeVisible();
    expect(
      within(strip).getByText(language === "en" ? "Agent input paused" : "智能体输入已暂停"),
    ).toBeVisible();
    expect(screen.queryByText(message.text)).not.toBeInTheDocument();
    expect(
      within(strip).getByText(
        language === "en"
          ? "This Run received untrusted external input."
          : "此运行接收了不可信的外部输入。",
      ),
    ).toBeVisible();
    await userEvent.click(
      within(strip).getByRole("button", { name: language === "en" ? "Steer" : "补充指示" }),
    );
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(
      screen.getByRole("button", { name: language === "en" ? "Cancel steering" : "取消补充指示" }),
    ).toBeVisible();
    await userEvent.click(
      within(strip).getByRole("button", { name: language === "en" ? "Approve" : "批准" }),
    );
    await waitFor(() =>
      expect(approvalPort.answer).toHaveBeenCalledWith({
        spaceId: agent.spaceId,
        requestId: request.id,
        decision: "approved",
      }),
    );
    await userEvent.click(
      within(strip).getByRole("button", { name: language === "en" ? "Show Run" : "查看运行" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: language === "en" ? "Still working" : "仍在工作" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText(message.text)).toBeVisible();
    await userEvent.type(screen.getByRole("textbox"), "Continue the selected work{enter}");
    await waitFor(() =>
      expect(f.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            steerRunId: run.id,
            text: "Continue the selected work",
          }),
        }),
      ),
    );
  },
);

it.each(["en", "zh"] as const)(
  "makes omitted active work explicit and offers authoritative refresh in %s",
  async (language) => {
    const f = fixture({
      language,
      snapshot: {
        conversation,
        messages: [],
        runs: [],
        segments: [],
        cursor: 0,
        activeRunsTruncated: true,
      },
    });
    f.mount(true);
    const copy = language === "en" ? en.agents : zh.agents;
    const strip = await screen.findByRole("region", { name: copy.stillWorking.title });
    expect(within(strip).getByText(copy.stillWorking.truncated)).toBeVisible();
    f.readSnapshot.mockResolvedValueOnce({
      conversation,
      messages: [],
      runs: [],
      segments: [],
      cursor: 0,
      activeRunsTruncated: false,
    });
    await userEvent.click(within(strip).getByRole("button", { name: copy.refresh }));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: copy.stillWorking.title }),
      ).not.toBeInTheDocument(),
    );
    expect(f.readSnapshot).toHaveBeenCalledTimes(2);
  },
);

it.each(["en", "zh"] as const)(
  "keeps empty-Space Agent creation in the Pages sidebar while collapsed (%s)",
  async (language) => {
    const test = fixture({ items: [], language });
    const copy = catalogs[language].agents;
    test.mount(false, "document", undefined, undefined, () => <h1>Pages fixture</h1>);
    await screen.findByRole("heading", { name: "Pages fixture" });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: catalogs[language].common.collapseSidebar }),
    );
    const sidebar = screen.getByRole("complementary");
    expect(within(sidebar).getByRole("button", { name: copy.createAgent })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: copy.createAgent })).toHaveLength(1);
    expect(
      within(screen.getByRole("main")).queryByRole("button", { name: copy.createAgent }),
    ).toBeNull();
  },
);

it.each(["en", "zh"] as const)(
  "filters Agents by name, resets with Escape and retains rail access (%s)",
  async (language) => {
    const other = {
      agent: { ...agent, id: agentSchema.shape.id.parse("research-agent"), name: "Research Agent" },
      conversation: {
        ...conversation,
        id: conversationSchema.shape.id.parse("research-conversation"),
      },
    };
    const test = fixture({ language, items: [{ agent, conversation }, other] });
    const copy = catalogs[language].agents;
    await act(async () => {
      test.mount(false, "document");
    });
    const section = await screen.findByRole("region", { name: copy.title });
    await within(section).findByRole("button", { name: agent.name });
    const user = userEvent.setup();
    await user.click(
      within(section).getByRole("button", {
        name: copy.workspaceSidebar.collapse.replace("{name}", copy.title),
      }),
    );
    const trigger = within(section).getByRole("button", {
      name: copy.workspaceSidebar.filterAgents,
    });
    await user.click(trigger);
    const input = await within(section).findByRole("textbox", {
      name: copy.workspaceSidebar.filterAgents,
    });
    expect(input).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.type(input, "  RESEARCH  ");
    expect(within(section).queryByRole("button", { name: agent.name })).toBeNull();
    expect(within(section).getByRole("button", { name: other.agent.name })).toBeVisible();
    await user.click(
      within(section).getByRole("button", { name: copy.workspaceSidebar.clearFilter }),
    );
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(within(section).getByRole("button", { name: agent.name })).toBeVisible();
    await user.type(input, "no matching name");
    expect(within(section).getByRole("status")).toHaveTextContent(copy.workspaceSidebar.noMatches);
    expect(within(section).getByRole("button", { name: copy.newAgent })).toBeEnabled();
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(within(section).queryByRole("status")).toBeNull();
    await user.keyboard("{Escape}");
    expect(within(section).queryByRole("textbox")).toBeNull();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    const reopened = within(section).getByRole("textbox", {
      name: copy.workspaceSidebar.filterAgents,
    });
    await user.type(reopened, "Research");
    await user.click(
      screen.getByRole("button", { name: catalogs[language].common.collapseSidebar }),
    );
    expect(within(section).queryByRole("textbox")).toBeNull();
    expect(within(section).getByRole("button", { name: agent.name })).toBeVisible();
    expect(within(section).getByRole("button", { name: other.agent.name })).toBeVisible();
    await user.click(screen.getByRole("button", { name: catalogs[language].common.expandSidebar }));
    const restored = within(section).getByRole("textbox", {
      name: copy.workspaceSidebar.filterAgents,
    });
    expect(restored).toHaveValue("Research");
    expect(restored).toHaveFocus();
    expect(within(section).queryByRole("button", { name: agent.name })).toBeNull();
    expect(test.send).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh"] as const)(
  "returns first-Agent form focus to the visible action after sidebar expansion (%s)",
  async (language) => {
    localStorage.setItem("raypx_sidebar_open", "false");
    const test = fixture({ items: [], language });
    const copy = catalogs[language].agents;
    await act(async () => {
      test.mount(false, "document");
    });
    const main = screen.getByRole("main");
    const user = userEvent.setup();
    await user.click(within(main).getByRole("button", { name: copy.createAgent }));
    await screen.findByRole("dialog", { name: copy.newAgent });
    await act(async () => {
      localStorage.setItem("raypx_sidebar_open", "true");
      window.dispatchEvent(
        new StorageEvent("storage", { key: "raypx_sidebar_open", newValue: "true" }),
      );
    });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const opener = within(screen.getByRole("complementary")).getByRole("button", {
      name: copy.createAgent,
    });
    expect(screen.getAllByRole("button", { name: copy.createAgent })).toHaveLength(1);
    await waitFor(() => expect(opener).toHaveFocus());
  },
);
