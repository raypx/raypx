import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AppShell, type ShellLinkProps } from "@raypx/blocks/shell";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { agentSchema, conversationSchema } from "@raypx/core/agents";
import { conversationEventSchema, messageSchema } from "@raypx/core/conversation";
import type { ApprovalSettingsState } from "@raypx/core/approvals";
import {
  spaceSchema,
  spaceMemberSchema,
  spaceDirectoryMemberSchema,
  type SpaceDirectoryMember,
  type SpaceEvent,
} from "@raypx/core/spaces";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import type { AgentsWorkspacePort, ConversationSocketPort, SpaceManagementPort } from "../model.js";
import commonEn from "@raypx/i18n/messages/en";
import commonZh from "@raypx/i18n/messages/zh";
import blocksEn from "@raypx/blocks/messages/en";
import blocksZh from "@raypx/blocks/messages/zh";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
import { AgentsWorkspace } from "./workspace.js";

const catalogs = {
  en: { ...commonEn, ...blocksEn, ...en },
  zh: { ...commonZh, ...blocksZh, ...zh },
};
const { BrowserLanguageProvider } = createBrowserI18n<typeof catalogs.en>(catalogs);
const time = "2026-11-13T03:00:00Z";
const eventTime = "2026-11-13T03:01:00Z";
const space = spaceSchema.parse({
  id: "shared",
  name: "Team Space",
  createdAt: time,
  updatedAt: time,
});
const otherSpace = spaceSchema.parse({
  id: "private",
  name: "My Space",
  createdAt: time,
  updatedAt: time,
});
const membership = {
  space,
  member: spaceMemberSchema.parse({
    spaceId: space.id,
    accountId: "viewer",
    role: "owner",
    createdAt: time,
  }),
};
const fallback = { space: otherSpace, member: { ...membership.member, spaceId: otherSpace.id } };
const viewer = spaceDirectoryMemberSchema.parse({
  ...membership.member,
  name: "Alex",
  image: null,
});
const teammate = spaceDirectoryMemberSchema.parse({
  ...membership.member,
  accountId: "teammate",
  role: "member",
  name: "Lin",
  image: null,
});
const agent = agentSchema.parse({
  id: "writer",
  spaceId: space.id,
  name: "Team Agent",
  instructions: "Be concise.",
  model: { modelId: "fixture" },
  createdAt: time,
  updatedAt: time,
});
const conversation = conversationSchema.parse({
  id: "team-conversation",
  spaceId: space.id,
  agentId: agent.id,
  kind: "direct",
  createdAt: time,
});
const messages = [
  messageSchema.parse({
    id: "viewer-message",
    spaceId: space.id,
    conversationId: conversation.id,
    sequence: 1,
    author: { kind: "member", accountId: "viewer" },
    text: "My team message",
    createdAt: time,
  }),
  messageSchema.parse({
    id: "teammate-message",
    spaceId: space.id,
    conversationId: conversation.id,
    sequence: 2,
    author: { kind: "member", accountId: "teammate" },
    text: "Lin's team message",
    createdAt: time,
  }),
];

beforeEach(() => {
  localStorage.clear();
});

function ShellLink({
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

async function fixture(language: "en" | "zh") {
  let memberships = [membership, fallback];
  let directory: SpaceDirectoryMember[] = [viewer, teammate];
  const connections: {
    receive(frame: ConversationServerFrame): void;
    disconnect(code: number): void;
    sent: ConversationClientFrame[];
    close: ReturnType<typeof vi.fn>;
  }[] = [];
  const socket: ConversationSocketPort = {
    connect(callbacks) {
      const connection = {
        receive: (frame: ConversationServerFrame) => callbacks.onFrame(frame),
        disconnect: (code: number) => callbacks.onClose(code),
        sent: [] as ConversationClientFrame[],
        close: vi.fn(),
      };
      connections.push(connection);
      queueMicrotask(() => callbacks.onFrame({ type: "ready", version: 1 }));
      return { send: (frame) => connection.sent.push(frame), close: connection.close };
    },
  };
  const getMembers = vi.fn<SpaceManagementPort["members"]>(async ({ spaceId }) =>
    spaceId === space.id ? directory : [{ ...viewer, spaceId: otherSpace.id }],
  );
  const management: SpaceManagementPort = {
    get: async ({ spaceId }) => (spaceId === space.id ? space : otherSpace),
    rename: async ({ name }) => ({ ...space, name }),
    delete: async () => ({ spaceId: space.id, status: "deleting" }),
    leave: async () => ({ accountId: "viewer", pausedRoutines: [] }),
    members: getMembers,
    updateMemberRole: async ({ accountId, role }) => ({ ...membership.member, accountId, role }),
    removeMember: async ({ accountId }) => ({ accountId, pausedRoutines: [] }),
    invitations: async () => [],
    createInvitation: async () => {
      throw new Error("Not used by this journey");
    },
    cancelInvitation: async () => ({ cancelled: 0 }),
    cancelInvitations: async () => ({ cancelled: 0 }),
    previewInvitation: async () => {
      throw new Error("Not used by this journey");
    },
    acceptInvitation: async () => {
      throw new Error("Not used by this journey");
    },
    settings: async ({ spaceId }) => ({ spaceId, approvalMode: "never", updatedAt: time }),
    setApprovalOverride: async ({ spaceId }) => ({
      spaceId,
      approvalMode: "never",
      updatedAt: time,
    }),
    clearApprovalOverride: async ({ spaceId }) => ({
      spaceId,
      approvalMode: null,
      updatedAt: time,
    }),
    audit: async () => ({ items: [], nextCursor: null }),
    events: async () => [],
  };
  const accountSettings: ApprovalSettingsState = {
    mode: "ask",
    rules: [],
    revision: 1,
    availableModes: [
      { mode: "ask", available: true, reasonCode: null },
      { mode: "never", available: true, reasonCode: null },
      { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
    ],
  };
  const send = vi.fn<AgentsWorkspacePort["conversations"]["send"]>(async () => messages[0]!);
  const client: AgentsWorkspacePort = {
    computers: {
      get: async () => ({ status: "not-configured" }),
      start: async () => ({ status: "not-configured" }),
      stop: async () => ({ status: "not-configured" }),
    },
    spaces: { list: async () => memberships, create: async () => fallback },
    agents: {
      list: async ({ spaceId }) => (spaceId === space.id ? [{ agent, conversation }] : []),
      models: async () => [],
      create: async () => ({ agent, conversation }),
      update: async () => ({ agent, conversation }),
      delete: async () => ({ deleted: true }),
    },
    conversations: {
      snapshot: async () => ({ conversation, messages, runs: [], segments: [], cursor: 2 }),
      send,
      stop: async () => {
        throw new Error("No Run is active");
      },
    },
  };
  const navigate = vi.fn();
  await act(async () => {
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <AppShell
          frame="document"
          brand={{ to: "/agents", label: "Raypx" }}
          navigation={[]}
          breadcrumbs={[]}
          layout="tool"
          LinkComponent={ShellLink}
        >
          <AgentsWorkspace
            client={client}
            spaceManagement={management}
            accountApprovalSettings={{ settings: async () => accountSettings }}
            accountId="viewer"
            origin="https://example.test"
            spaceId={space.id}
            agentId={agent.id}
            socket={socket}
            drafts={{ read: () => null, write() {}, remove() {} }}
            onNavigate={navigate}
          />
        </AppShell>
      </BrowserLanguageProvider>,
    );
  });
  async function emitSpace(event: SpaceEvent) {
    const stream = connections.find(
      (connection) =>
        connection.close.mock.calls.length === 0 &&
        connection.sent.some(
          (frame) => frame.type === "space.subscribe" && frame.spaceId === space.id,
        ),
    );
    expect(stream).toBeDefined();
    await act(async () => stream!.receive({ type: "space.event", spaceId: space.id, event }));
  }
  async function emitConversation(event: Record<string, unknown>) {
    await waitFor(() =>
      expect(
        connections.some((connection) =>
          connection.sent.some((frame) => frame.type === "subscribe"),
        ),
      ).toBe(true),
    );
    const stream = connections.find(
      (connection) =>
        connection.close.mock.calls.length === 0 &&
        connection.sent.some((frame) => frame.type === "subscribe"),
    );
    expect(stream).toBeDefined();
    await act(async () =>
      stream!.receive({
        type: "event",
        entry: {
          event: conversationEventSchema.parse({
            spaceId: space.id,
            conversationId: conversation.id,
            createdAt: eventTime,
            ...event,
          }),
        },
      }),
    );
  }
  return {
    connections,
    send,
    navigate,
    getMembers,
    emitSpace,
    emitConversation,
    async disconnectSpace() {
      const stream = connections.find(
        (connection) =>
          connection.close.mock.calls.length === 0 &&
          connection.sent.some((frame) => frame.type === "space.subscribe"),
      );
      expect(stream).toBeDefined();
      await act(async () => stream!.disconnect(4003));
    },
    setMembers(members: SpaceDirectoryMember[]) {
      directory = members;
    },
    removeCurrentMembership() {
      memberships = [fallback];
    },
  };
}

it.each(["en", "zh"] as const)(
  "refreshes sender names from the live directory and omits all labels with one member in %s",
  async (language) => {
    const strings = catalogs[language].agents;
    const test = await fixture(language);
    await screen.findByText("Lin's team message");
    const log = screen.getByRole("log", { name: strings.conversation });
    await waitFor(() =>
      expect(within(log).getByRole("heading", { name: "Lin" })).toBeInTheDocument(),
    );
    expect(within(log).getByRole("heading", { name: strings.you })).toBeInTheDocument();
    expect(within(log).queryByRole("heading", { name: strings.member })).not.toBeInTheDocument();
    test.setMembers([viewer, { ...teammate, name: "Lin Chen", role: "owner" }]);
    await test.emitSpace({
      id: 1,
      spaceId: space.id,
      kind: "space.member.role_changed",
      payload: { accountId: "teammate", role: "owner" },
      createdAt: eventTime,
    });
    await waitFor(() =>
      expect(within(log).getByRole("heading", { name: "Lin Chen" })).toBeInTheDocument(),
    );
    expect(within(log).queryByRole("heading", { name: "Lin" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        test.connections.some((connection) =>
          connection.sent.some((frame) => frame.type === "space.ack" && frame.sequence === 1),
        ),
      ).toBe(true),
    );
    test.setMembers([viewer]);
    await test.emitSpace({
      id: 2,
      spaceId: space.id,
      kind: "space.member.removed",
      payload: { accountId: "teammate" },
      createdAt: eventTime,
    });
    await waitFor(() => expect(within(log).queryByRole("heading")).not.toBeInTheDocument());
    expect(within(log).getByText("Lin's team message")).toBeInTheDocument();
    expect(test.send).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh"] as const)(
  "names live approval answers and shows a Space override of the account default in %s",
  async (language) => {
    const strings = catalogs[language].agents;
    const test = await fixture(language);
    await screen.findByText("Lin's team message");
    const override = await screen.findByText(
      `${strings.spaceSettings.overridesDefault}: ${strings.approvalSettings.never}`,
    );
    expect(override).toBeInTheDocument();
    const card = {
      kind: "card.resolved",
      requestId: "lin-approval",
      runId: "lin-run",
      toolCallId: "lin-tool",
      toolName: "computer_write_file",
      target: "team-notes.txt",
      argumentSummary: "Write team notes",
      memberAccountId: "teammate",
      expiresAt: "2100-01-01T00:00:00Z",
      outcome: "approved",
      answeredByAccountId: "teammate",
      sequence: 3,
    };
    const finished = {
      kind: "tool.finished",
      runId: "lin-run",
      toolCallId: "lin-tool",
      toolName: "computer_write_file",
      target: "team-notes.txt",
      argumentSummary: "Write team notes",
      outcome: "succeeded",
      durationMs: 10,
      exitStatus: null,
      sequence: 4,
    };
    await test.emitConversation(card);
    await test.emitConversation(finished);
    const log = screen.getByRole("log", { name: strings.conversation });
    await waitFor(() => expect(log.querySelector("[data-tool-activity]")).toBeInTheDocument());
    const activity = log.querySelector<HTMLElement>("[data-tool-activity]")!;
    fireEvent.click(within(activity).getByRole("button"));
    const answeredByLin = strings.spaceSettings.approvedBy.replace("{name}", "Lin");
    expect(await within(activity).findByText(answeredByLin)).toBeInTheDocument();
    test.setMembers([viewer, { ...teammate, name: "Lin Chen" }]);
    await test.emitSpace({
      id: 1,
      spaceId: space.id,
      kind: "space.member.role_changed",
      payload: { accountId: "teammate", role: "member" },
      createdAt: eventTime,
    });
    expect(
      await within(activity).findByText(
        strings.spaceSettings.approvedBy.replace("{name}", "Lin Chen"),
      ),
    ).toBeInTheDocument();
    expect(within(activity).queryByText(answeredByLin)).not.toBeInTheDocument();

    await test.emitConversation({
      ...card,
      requestId: "viewer-approval",
      runId: "viewer-run",
      toolCallId: "viewer-tool",
      memberAccountId: "viewer",
      answeredByAccountId: "viewer",
      sequence: 5,
    });
    await test.emitConversation({
      ...finished,
      runId: "viewer-run",
      toolCallId: "viewer-tool",
      sequence: 6,
    });
    await waitFor(() => expect(log.querySelectorAll("[data-tool-activity]")).toHaveLength(2));
    const viewerActivity = log.querySelectorAll<HTMLElement>("[data-tool-activity]")[1]!;
    fireEvent.click(within(viewerActivity).getByRole("button"));
    const answeredByYou = strings.spaceSettings.approvedBy.replace("{name}", strings.you);
    expect(await within(viewerActivity).findByText(answeredByYou)).toBeInTheDocument();
    test.setMembers([viewer]);
    await test.emitSpace({
      id: 2,
      spaceId: space.id,
      kind: "space.member.removed",
      payload: { accountId: "teammate" },
      createdAt: eventTime,
    });
    await waitFor(() =>
      expect(within(viewerActivity).queryByText(answeredByYou)).not.toBeInTheDocument(),
    );
    expect(
      within(activity).queryByText(strings.spaceSettings.approvedBy.replace("{name}", "Lin Chen")),
    ).not.toBeInTheDocument();
    expect(test.send).not.toHaveBeenCalled();
  },
);

it.each([
  ["en", "event"],
  ["zh", "event"],
  ["en", "socket"],
  ["zh", "socket"],
] as const)(
  "closes the current Space and its conversation immediately when the viewer is removed in %s via %s",
  async (language, signal) => {
    const strings = catalogs[language].agents;
    const test = await fixture(language);
    await screen.findByText("Lin's team message");
    await waitFor(() =>
      expect(
        test.connections.some((connection) =>
          connection.sent.some((frame) => frame.type === "space.subscribe"),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: strings.space }));
    fireEvent.click(await screen.findByRole("menuitem", { name: strings.spaceSettings.title }));
    await screen.findByRole("dialog", { name: strings.spaceSettings.title });
    test.removeCurrentMembership();
    if (signal === "event") {
      await test.emitSpace({
        id: 1,
        spaceId: space.id,
        kind: "space.member.removed",
        payload: { accountId: "viewer" },
        createdAt: eventTime,
      });
    } else {
      await test.disconnectSpace();
    }
    await waitFor(() => expect(screen.queryByRole("log")).not.toBeInTheDocument());
    expect(
      screen.queryByRole("dialog", { name: strings.spaceSettings.title }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Lin's team message")).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        signal === "event"
          ? strings.spaceSettings.exitRemoved
          : strings.spaceSettings.exitUnavailable,
        { exact: true },
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(test.navigate).toHaveBeenCalledWith({ spaceId: otherSpace.id }));
    expect(screen.getByRole("button", { name: strings.space })).toHaveTextContent(otherSpace.name);
    await waitFor(() =>
      expect(
        test.connections.some(
          (connection) =>
            connection.sent.some(
              (frame) => frame.type === "subscribe" && frame.conversationId === conversation.id,
            ) && connection.close.mock.calls.length > 0,
        ),
      ).toBe(true),
    );
    expect(test.send).not.toHaveBeenCalled();
  },
  15_000,
);
