import { AppShell, type ShellLinkProps } from "@raypx/blocks/shell";
import blocksEn from "@raypx/blocks/messages/en";
import blocksZh from "@raypx/blocks/messages/zh";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { agentSchema, conversationSchema } from "@raypx/core/agents";
import commonEn from "@raypx/i18n/messages/en";
import commonZh from "@raypx/i18n/messages/zh";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
import { spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { AgentsWorkspace } from "./workspace.js";
import type { AgentsWorkspacePort, GroupsPort } from "../model.js";
import { GroupForm, GroupParticipants, groupErrorCode } from "./group-directory.js";
const catalogs = {
  en: { ...commonEn, ...blocksEn, ...en },
  zh: { ...commonZh, ...blocksZh, ...zh },
};
const { BrowserLanguageProvider } = createBrowserI18n<typeof catalogs.en>(catalogs);
const time = "2026-11-14T00:00:00Z";
const agents = [
  "Writing Agent 中文很长的名字",
  "Review Agent 中文很长的名字",
  "Research Agent",
].map((name, index) => ({
  agent: agentSchema.parse({
    id: `agent-${index}`,
    spaceId: "space",
    name,
    instructions: "",
    model: { modelId: "model" },
    createdAt: time,
    updatedAt: time,
  }),
  conversation: conversationSchema.parse({
    id: `direct-${index}`,
    spaceId: "space",
    agentId: `agent-${index}`,
    kind: "direct",
    createdAt: time,
  }),
}));
const conversation = conversationSchema.parse({
  ...agents[0]!.conversation,
  id: "group",
  kind: "group",
  name: "Planning group",
  agentIds: agents.slice(0, 2).map((item) => item.agent.id),
});
beforeEach(() => localStorage.clear());
for (const language of ["en", "zh"] as const) {
  it(`creates a named group with explicit selected Agent ids (${language})`, async () => {
    const copy = catalogs[language].agents;
    const onSave = vi.fn(async () => {});
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <GroupForm agents={agents} onSave={onSave} onClose={() => {}} />
      </BrowserLanguageProvider>,
    );
    fireEvent.change(screen.getByLabelText(copy.groups.name), {
      target: { value: "Planning group" },
    });
    const choices = screen.getAllByRole("checkbox");
    expect(choices.map((choice) => choice.getAttribute("data-value"))).toEqual(
      agents.map((item) => item.agent.id),
    );
    fireEvent.click(choices[0]!);
    fireEvent.click(choices[1]!);
    fireEvent.click(screen.getByRole("button", { name: copy.groups.create }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: "Planning group",
        agentIds: agents.slice(0, 2).map((item) => item.agent.id),
      }),
    );
  });
  it(`renders authoritative group refusal codes inline (${language})`, async () => {
    const copy = catalogs[language].agents;
    const port: GroupsPort = {
      createGroup: vi.fn(),
      listGroups: vi.fn(),
      getGroup: vi.fn(),
      renameGroup: vi.fn(),
      addGroupAgent: vi.fn(),
      deleteGroup: vi.fn(),
      removeGroupAgent: vi.fn(async () => {
        throw { data: { error: { code: "GROUP_MIN_AGENTS" } } };
      }),
    };
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <GroupParticipants
          group={{ conversation, agents: agents.slice(0, 2).map((item) => item.agent) }}
          agents={agents}
          port={port}
          onChange={() => {}}
          onDeleted={() => {}}
        />
      </BrowserLanguageProvider>,
    );
    const row = screen.getByText(agents[0]!.agent.name).closest("li")!;
    fireEvent.click(within(row).getByRole("button"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(copy.GROUP_MIN_AGENTS));
    expect(port.removeGroupAgent).toHaveBeenCalledWith({
      spaceId: "space",
      conversationId: "group",
      agentId: agents[0]!.agent.id,
    });
  });
}
it("maps stable server group refusals without exposing arbitrary diagnostics", () => {
  expect(groupErrorCode({ data: { error: { code: "GROUP_AGENT_NOT_PARTICIPANT" } } })).toBe(
    "GROUP_AGENT_NOT_PARTICIPANT",
  );
  expect(groupErrorCode({ message: "GROUP_AGENT_LIMIT" })).toBe("GROUP_AGENT_LIMIT");
  expect(groupErrorCode({ message: "private server details" })).toBe("saveError");
});

it("manages the group's name and membership, then confirms deletion", async () => {
  let stored = conversation;
  const onDeleted = vi.fn();
  const renameGroup = vi.fn<GroupsPort["renameGroup"]>(async ({ name }) => {
    stored = { ...stored, name };
    return stored;
  });
  const addGroupAgent = vi.fn<GroupsPort["addGroupAgent"]>(async ({ agentId }) => {
    stored = { ...stored, agentIds: [...(stored.agentIds ?? []), agentId] };
    return stored;
  });
  const removeGroupAgent = vi.fn<GroupsPort["removeGroupAgent"]>(async ({ agentId }) => {
    stored = { ...stored, agentIds: stored.agentIds?.filter((id) => id !== agentId) ?? [] };
    return stored;
  });
  const deleteGroup = vi.fn<GroupsPort["deleteGroup"]>(async () => ({ deleted: true }));
  const port: GroupsPort = {
    createGroup: vi.fn(),
    listGroups: vi.fn(),
    getGroup: vi.fn(),
    renameGroup,
    addGroupAgent,
    removeGroupAgent,
    deleteGroup,
  };
  function Contents() {
    const [current, setCurrent] = useState(conversation);
    return (
      <GroupParticipants
        group={{
          conversation: current,
          agents: agents
            .filter((item) => current.agentIds?.includes(item.agent.id))
            .map((item) => item.agent),
        }}
        agents={agents}
        port={port}
        onChange={setCurrent}
        onDeleted={onDeleted}
      />
    );
  }
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <Contents />
    </BrowserLanguageProvider>,
  );
  fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Renamed group" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(renameGroup).toHaveBeenCalledWith({
      spaceId: "space",
      conversationId: "group",
      name: "Renamed group",
    }),
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
  fireEvent.click(screen.getByRole("checkbox", { name: agents[2]!.agent.name }));
  fireEvent.click(screen.getByRole("button", { name: "Add Agents" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: `Remove ${agents[2]!.agent.name}` })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: `Remove ${agents[0]!.agent.name}` }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: `Remove ${agents[0]!.agent.name}` }),
    ).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(deleteGroup).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete group" }));
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(deleteGroup).toHaveBeenCalledWith({ spaceId: "space", conversationId: "group" });
});
it("closes group creation with one Escape and returns focus to its opener", async () => {
  function Contents() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open group form</button>
        {open && (
          <GroupForm agents={agents} onSave={async () => {}} onClose={() => setOpen(false)} />
        )}
      </>
    );
  }
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <Contents />
    </BrowserLanguageProvider>,
  );
  const user = userEvent.setup();
  const opener = screen.getByRole("button", { name: "Open group form" });
  await user.click(opener);
  await screen.findByRole("dialog", { name: "New group" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});

it("separates direct Agents and groups and opens the selected group conversation", async () => {
  const space = spaceSchema.parse({ id: "space", name: "Team", createdAt: time, updatedAt: time });
  const member = spaceMemberSchema.parse({
    spaceId: space.id,
    accountId: "member",
    role: "member",
    createdAt: time,
  });
  const groups: GroupsPort = {
    createGroup: vi.fn(),
    listGroups: vi.fn(async () => [conversation]),
    getGroup: vi.fn(async () => conversation),
    renameGroup: vi.fn(),
    addGroupAgent: vi.fn(),
    removeGroupAgent: vi.fn(),
    deleteGroup: vi.fn(),
  };
  const snapshot = vi.fn<AgentsWorkspacePort["conversations"]["snapshot"]>(
    async ({ conversationId }) => ({
      conversation: conversationId === conversation.id ? conversation : agents[0]!.conversation,
      messages: [],
      runs: [],
      segments: [],
      cursor: 0,
    }),
  );
  const client: AgentsWorkspacePort = {
    groups,
    spaces: { list: async () => [{ space, member }], create: vi.fn() },
    agents: {
      list: async () => agents,
      models: async () => [],
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    computers: { get: async () => ({ status: "not-configured" }), start: vi.fn(), stop: vi.fn() },
    conversations: { snapshot, send: vi.fn(), stop: vi.fn() },
  };
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <AgentsWorkspace
        client={client}
        accountId="member"
        origin="https://example.test"
        socket={{
          connect(callbacks) {
            queueMicrotask(() => callbacks.onFrame({ type: "ready", version: 1 }));
            return { send() {}, close() {} };
          },
        }}
        drafts={{ read: () => null, write() {}, remove() {} }}
      />
    </BrowserLanguageProvider>,
  );
  await screen.findByRole("heading", { name: "Direct Agents" });
  const section = screen.getByRole("region", { name: "Groups" });
  expect(within(section).getByRole("button", { name: conversation.name ?? "" })).toBeEnabled();
  expect(screen.getByRole("button", { name: agents[0]!.agent.name })).toBeEnabled();
  fireEvent.click(within(section).getByRole("button", { name: conversation.name ?? "" }));
  await screen.findByRole("log");
  await waitFor(() =>
    expect(snapshot).toHaveBeenCalledWith({ spaceId: "space", conversationId: "group" }),
  );
});

function WorkspaceTestLink({
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
async function pendingGroupFixture({ creating = false }: { creating?: boolean } = {}) {
  const space = spaceSchema.parse({ id: "space", name: "Team", createdAt: time, updatedAt: time });
  const other = { ...space, id: spaceSchema.shape.id.parse("other"), name: "Other" };
  const member = spaceMemberSchema.parse({
    spaceId: space.id,
    accountId: "member",
    role: "member",
    createdAt: time,
  });
  const onNavigate = vi.fn();
  let finishCreate!: (value: typeof conversation) => void;
  let finishDelete!: (value: { deleted: true }) => void;
  const createGroup = vi.fn<GroupsPort["createGroup"]>(
    () =>
      new Promise((resolve) => {
        finishCreate = resolve;
      }),
  );
  const deleteGroup = vi.fn<GroupsPort["deleteGroup"]>(
    () =>
      new Promise((resolve) => {
        finishDelete = resolve;
      }),
  );
  const groups: GroupsPort = {
    createGroup,
    listGroups: async ({ spaceId }) => (!creating && spaceId === space.id ? [conversation] : []),
    getGroup: async () => conversation,
    renameGroup: vi.fn(),
    addGroupAgent: vi.fn(),
    removeGroupAgent: vi.fn(),
    deleteGroup,
  };
  const snapshot = vi.fn<AgentsWorkspacePort["conversations"]["snapshot"]>(
    async ({ conversationId }) => ({
      conversation: conversationId === conversation.id ? conversation : agents[0]!.conversation,
      messages: [],
      runs: [],
      segments: [],
      cursor: 0,
    }),
  );
  const client: AgentsWorkspacePort = {
    groups,
    spaces: {
      list: async () => [
        { space, member },
        { space: other, member: { ...member, spaceId: other.id } },
      ],
      create: vi.fn(),
    },
    agents: {
      list: async ({ spaceId }) => (spaceId === space.id ? agents : []),
      models: async () => [],
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    computers: { get: async () => ({ status: "not-configured" }), start: vi.fn(), stop: vi.fn() },
    conversations: { snapshot, send: vi.fn(), stop: vi.fn() },
  };
  await act(async () => {
    render(
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <AppShell
          frame="document"
          brand={{ to: "/agents", label: "Raypx" }}
          navigation={[]}
          breadcrumbs={[]}
          layout="tool"
          LinkComponent={WorkspaceTestLink}
        >
          <AgentsWorkspace
            client={client}
            accountId="member"
            origin="https://example.test"
            {...(!creating ? { groupId: conversation.id } : {})}
            onNavigate={onNavigate}
            socket={{
              connect(callbacks) {
                queueMicrotask(() => callbacks.onFrame({ type: "ready", version: 1 }));
                return { send() {}, close() {} };
              },
            }}
            drafts={{ read: () => null, write() {}, remove() {} }}
          />
        </AppShell>
      </BrowserLanguageProvider>,
    );
  });
  return {
    onNavigate,
    createGroup,
    deleteGroup,
    snapshot,
    finishCreate: () => finishCreate(conversation),
    finishDelete: () => finishDelete({ deleted: true }),
  };
}
it.each(["agent", "space"] as const)(
  "keeps a dismissed group's delayed creation from replacing a later %s selection",
  async (target) => {
    const fixture = await pendingGroupFixture({ creating: true });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New group" }));
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Planning group" } });
    fireEvent.click(screen.getByRole("checkbox", { name: agents[0]!.agent.name }));
    fireEvent.click(screen.getByRole("checkbox", { name: agents[1]!.agent.name }));
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(fixture.createGroup).toHaveBeenCalledOnce());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    if (target === "agent") {
      await user.click(screen.getByRole("button", { name: agents[0]!.agent.name }));
      await screen.findByRole("log");
    } else {
      await user.click(screen.getByRole("button", { name: "Space" }));
      await user.click(await screen.findByRole("menuitemradio", { name: "Other" }));
    }
    await act(async () => fixture.finishCreate());
    const expected =
      target === "agent"
        ? { spaceId: "space", agentId: agents[0]!.agent.id }
        : { spaceId: "other" };
    expect(fixture.onNavigate).toHaveBeenLastCalledWith(expected);
    expect(screen.queryByRole("button", { name: "Participants" })).not.toBeInTheDocument();
  },
);
it("returns Participants focus after one Escape and ignores deletion completion in a different Space", async () => {
  const fixture = await pendingGroupFixture();
  const user = userEvent.setup();
  const opener = await screen.findByRole("button", { name: "Participants" });
  await user.click(opener);
  await screen.findByRole("dialog", { name: "Participants" });
  await screen.findByLabelText("Group name");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
  await user.click(opener);
  await user.click(await screen.findByRole("button", { name: "Delete group" }));
  const confirmation = await screen.findByRole("alertdialog");
  await user.click(within(confirmation).getByRole("button", { name: "Delete group" }));
  await waitFor(() => expect(fixture.deleteGroup).toHaveBeenCalledOnce());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Space" }));
  await user.click(await screen.findByRole("menuitemradio", { name: "Other" }));
  await waitFor(() => expect(fixture.onNavigate).toHaveBeenLastCalledWith({ spaceId: "other" }));
  await act(async () => fixture.finishDelete());
  expect(fixture.onNavigate).toHaveBeenLastCalledWith({ spaceId: "other" });
  expect(screen.queryByRole("button", { name: conversation.name ?? "" })).not.toBeInTheDocument();
});

it("includes groups when refreshing the Space computer activity", async () => {
  const fixture = await pendingGroupFixture();
  await screen.findByRole("log");
  await waitFor(() =>
    expect(fixture.snapshot).toHaveBeenCalledWith({
      spaceId: "space",
      conversationId: conversation.id,
    }),
  );
  fixture.snapshot.mockClear();
  fireEvent.click(
    await screen.findByRole("button", { name: "Computer: Not configured on this server" }),
  );
  await waitFor(() =>
    expect(fixture.snapshot).toHaveBeenCalledWith({
      spaceId: "space",
      conversationId: conversation.id,
    }),
  );
  for (const item of agents)
    expect(fixture.snapshot).toHaveBeenCalledWith({
      spaceId: "space",
      conversationId: item.conversation.id,
    });
});
