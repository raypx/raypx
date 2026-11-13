import { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { spaceIdSchema, type SpaceDirectoryMember } from "@raypx/core/spaces";
import type { ApprovalSettingsState } from "@raypx/core/approvals";
import {
  SpaceJoinController,
  SpaceManagementController,
  type SpaceManagementPort,
} from "../model/space-management.js";
import { CapabilitySheet } from "./capability-sheet.js";
import { SpaceSettingsPanel } from "./space-settings.js";
import { JoinSpaceView } from "./join-space.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const spaceId = spaceIdSchema.parse("team");
const time = "2026-11-14T00:00:00.000Z";
const space = { id: spaceId, name: "Team", createdAt: time, updatedAt: time };
const owner: SpaceDirectoryMember = {
  spaceId,
  accountId: "owner",
  role: "owner",
  name: "Alex",
  image: null,
  email: "alex@example.test",
  createdAt: time,
};
const member: SpaceDirectoryMember = {
  spaceId,
  accountId: "member",
  role: "member",
  name: "Mei",
  image: null,
  createdAt: time,
};
const invitation = {
  spaceId,
  id: "invitation",
  inviterAccountId: "owner",
  inviterName: "Alex",
  createdAt: time,
  expiresAt: "2026-11-21T00:00:00.000Z",
};
const token = "a".repeat(64);
const preview = {
  spaceId,
  spaceName: "Team",
  inviterName: "Alex",
  expiresAt: invitation.expiresAt,
  alreadyMember: false,
  shares: ["agents", "conversations", "memory", "routines", "team_computer", "pages"] as const,
};
const accountSettings: ApprovalSettingsState = {
  mode: "ask",
  revision: 0,
  rules: [],
  availableModes: [
    { mode: "ask", available: true, reasonCode: null },
    { mode: "never", available: true, reasonCode: null },
    { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
  ],
};
function fixture() {
  return {
    get: vi.fn<SpaceManagementPort["get"]>(async () => space),
    rename: vi.fn<SpaceManagementPort["rename"]>(async ({ name }) => ({ ...space, name })),
    delete: vi.fn<SpaceManagementPort["delete"]>(async () => ({ spaceId, status: "deleting" })),
    leave: vi.fn<SpaceManagementPort["leave"]>(async () => ({
      accountId: "member",
      pausedRoutines: [],
    })),
    members: vi.fn<SpaceManagementPort["members"]>(async () => [owner, member]),
    updateMemberRole: vi.fn<SpaceManagementPort["updateMemberRole"]>(
      async ({ accountId, role }) => ({ spaceId, accountId, role, createdAt: time }),
    ),
    removeMember: vi.fn<SpaceManagementPort["removeMember"]>(async ({ accountId }) => ({
      accountId,
      pausedRoutines: [{ id: "routine", name: "Daily check" }],
    })),
    invitations: vi.fn<SpaceManagementPort["invitations"]>(async () => [invitation]),
    createInvitation: vi.fn<SpaceManagementPort["createInvitation"]>(async () => ({
      ...invitation,
      token,
    })),
    cancelInvitation: vi.fn<SpaceManagementPort["cancelInvitation"]>(async () => ({
      cancelled: 1,
    })),
    cancelInvitations: vi.fn<SpaceManagementPort["cancelInvitations"]>(async () => ({
      cancelled: 1,
    })),
    previewInvitation: vi.fn<SpaceManagementPort["previewInvitation"]>(async () => ({
      ...preview,
      shares: [...preview.shares],
    })),
    acceptInvitation: vi.fn<SpaceManagementPort["acceptInvitation"]>(async () => ({
      space,
      member,
      joined: true,
    })),
    settings: vi.fn<SpaceManagementPort["settings"]>(async () => ({
      spaceId,
      approvalMode: null,
      updatedAt: null,
    })),
    setApprovalOverride: vi.fn<SpaceManagementPort["setApprovalOverride"]>(async ({ mode }) => ({
      spaceId,
      approvalMode: mode === "auto" ? "ask" : mode,
      updatedAt: time,
    })),
    clearApprovalOverride: vi.fn<SpaceManagementPort["clearApprovalOverride"]>(async () => ({
      spaceId,
      approvalMode: null,
      updatedAt: time,
    })),
    audit: vi.fn<SpaceManagementPort["audit"]>(async () => ({ items: [], nextCursor: null })),
    events: vi.fn<SpaceManagementPort["events"]>(async () => []),
  };
}
async function mount(
  options: {
    language?: "en" | "zh";
    role?: "owner" | "member";
    port?: ReturnType<typeof fixture>;
  } = {},
) {
  const port = options.port ?? fixture();
  const role = options.role ?? "owner";
  const controller = new SpaceManagementController({
    spaceId,
    accountId: role,
    port,
    accountApprovals: { settings: async () => accountSettings },
  });
  await controller.load(role === "owner");
  const onExit = vi.fn();
  const onOpenRoutine = vi.fn();
  render(
    <BrowserLanguageProvider initialPreference={options.language ?? "en"} restorePreference={false}>
      <SpaceSettingsPanel
        controller={controller}
        role={role}
        onExit={onExit}
        onOpenRoutine={onOpenRoutine}
        invitationOrigin="https://raypx.example"
      />
    </BrowserLanguageProvider>,
  );
  return { port, controller, onExit, onOpenRoutine };
}
async function section(name: string, label = "Section") {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name }));
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
}
beforeEach(() => localStorage.clear());

it.each(["en", "zh"] as const)(
  "shows directory names, roles, dates and only returned email in %s",
  async (language) => {
    await mount({ language });
    await section(language === "en" ? "Members" : "成员", language === "en" ? "Section" : "设置项");
    expect(screen.getByText("Alex")).toBeVisible();
    expect(screen.getByText("Mei")).toBeVisible();
    expect(screen.getByText("alex@example.test")).toBeVisible();
    expect(screen.queryByText("mei@example.test")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: language === "en" ? "Change role for Mei" : "更改Mei的角色",
      }),
    ).toBeEnabled();
  },
);

it("gives members read-only General and Members without requesting owner data", async () => {
  const { port } = await mount({ role: "member" });
  expect(screen.getByRole("textbox", { name: "Space name" })).toHaveAttribute("readonly");
  expect(screen.getByText("The current Space approval mode is unavailable.")).toBeVisible();
  await userEvent.click(screen.getByRole("combobox", { name: "Section" }));
  expect(screen.getAllByRole("option")).toHaveLength(2);
  expect(screen.getByRole("option", { name: "General" })).toHaveAttribute("data-value", "general");
  expect(screen.getByRole("option", { name: "Members" })).toHaveAttribute("data-value", "members");
  expect(screen.queryByRole("option", { name: "Invitations" })).not.toBeInTheDocument();
  expect(port.settings).not.toHaveBeenCalled();
  expect(port.invitations).not.toHaveBeenCalled();
  expect(port.audit).not.toHaveBeenCalled();
});

it("requires the typed Space name and shows the last-private refusal", async () => {
  const { port } = await mount();
  port.delete.mockRejectedValueOnce({ data: { code: "SPACE_LAST_PRIVATE" } });
  await userEvent.click(screen.getByRole("button", { name: "Delete Space" }));
  const dialog = await screen.findByRole("dialog", { name: "Delete Team?" });
  const remove = within(dialog).getByRole("button", { name: "Delete Space" });
  expect(remove).toBeDisabled();
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Type Team to confirm" }), {
    target: { value: "Team" },
  });
  await userEvent.click(remove);
  await waitFor(() => expect(port.delete).toHaveBeenCalledOnce());
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "You cannot delete your last private Space.",
  );
});

it("confirms a role change and shows a last-owner refusal without a local change", async () => {
  const { port } = await mount();
  port.updateMemberRole.mockRejectedValueOnce({ message: "SPACE_LAST_OWNER" });
  await section("Members");
  await userEvent.click(screen.getByRole("button", { name: "Change role for Alex" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Change role for Alex?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Make member" }));
  await waitFor(() =>
    expect(port.updateMemberRole).toHaveBeenCalledWith({
      spaceId,
      accountId: "owner",
      role: "member",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This Space must keep at least one owner.",
  );
});

it("confirms removal consequences and opens returned paused routines", async () => {
  const { port, onOpenRoutine } = await mount();
  await section("Members");
  await userEvent.click(screen.getByRole("button", { name: "Remove Mei" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Remove Mei?" });
  expect(dialog).toHaveTextContent("Their access ends now.");
  expect(dialog).toHaveTextContent("pending approvals and running work");
  expect(dialog).toHaveTextContent("Routines they own are paused.");
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove member" }));
  await waitFor(() =>
    expect(port.removeMember).toHaveBeenCalledWith({ spaceId, accountId: "member" }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Daily check" }));
  expect(onOpenRoutine).toHaveBeenCalledWith("routine");
});

it("shows an invitation once, copies it and clears its token on Escape", async () => {
  const copy = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  const { controller } = await mount();
  await section("Invitations");
  const create = screen.getByRole("button", { name: "Create invitation" });
  await userEvent.click(create);
  const input = await screen.findByRole("textbox", { name: "Invitation link" });
  expect(input).toHaveValue(`https://raypx.example/join#${token}`);
  await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect(copy).toHaveBeenCalledWith(`https://raypx.example/join#${token}`);
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Invitation link" })).not.toBeInTheDocument(),
  );
  expect(controller.getSnapshot().issuedInvitation).toBeNull();
  expect(document.body.textContent).not.toContain(token);
  await waitFor(() => expect(create).toHaveFocus());
});

it("does not retain a delayed invitation after its dialog closes", async () => {
  const { port, controller } = await mount();
  let finish!: (value: Awaited<ReturnType<SpaceManagementPort["createInvitation"]>>) => void;
  port.createInvitation.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await section("Invitations");
  await userEvent.click(screen.getByRole("button", { name: "Create invitation" }));
  await screen.findByRole("dialog", { name: "Invitation link" });
  await userEvent.keyboard("{Escape}");
  await act(async () => finish({ ...invitation, token }));
  await waitFor(() => expect(controller.getSnapshot().issuedInvitation).toBeNull());
  expect(screen.queryByRole("textbox", { name: "Invitation link" })).not.toBeInTheDocument();
});

it("disables unavailable approval modes and confirms Never ask", async () => {
  const { port } = await mount();
  await section("Approvals");
  expect(screen.getByText("Your account default: Ask before changes")).toBeVisible();
  expect(screen.getByText(/A review model is not configured/)).toBeVisible();
  await userEvent.click(screen.getByRole("combobox", { name: "Space override" }));
  expect(screen.getByRole("option", { name: "Auto" })).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(screen.getByRole("option", { name: "Never ask" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Never ask before changes?" });
  expect(dialog).toHaveTextContent("for every member");
  await userEvent.click(within(dialog).getByRole("button", { name: "Never ask" }));
  await waitFor(() =>
    expect(port.setApprovalOverride).toHaveBeenCalledWith({ spaceId, mode: "never" }),
  );
});

it("shows paginated plain-language audit entries and an explicit unavailable state", async () => {
  const { port } = await mount();
  port.audit.mockResolvedValueOnce({
    items: [
      {
        spaceId,
        id: "audit",
        operationId: "op",
        actorAccountId: "owner",
        action: "member.role_changed",
        targetId: "member",
        outcome: "succeeded",
        code: null,
        createdAt: time,
      },
    ],
    nextCursor: "cursor",
  });
  await section("Audit");
  expect(await screen.findByText("Alex · Changed member role")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Load older entries" }));
  await waitFor(() =>
    expect(port.audit).toHaveBeenLastCalledWith({ spaceId, cursor: "cursor", limit: 50 }),
  );
  port.audit.mockRejectedValueOnce({ message: "SPACE_AUDIT_UNAVAILABLE" });
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Space audit is unavailable.");
});

it.each([
  "INVITATION_NOT_FOUND",
  "INVITATION_EXPIRED",
  "INVITATION_CANCELLED",
  "INVITATION_CONSUMED",
] as const)("shows the distinct join error %s", async (code) => {
  const port = fixture();
  port.previewInvitation.mockRejectedValueOnce({ data: { code } });
  const controller = new SpaceJoinController(port);
  controller.setToken(token);
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <JoinSpaceView controller={controller} onJoined={vi.fn()} />
    </BrowserLanguageProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(en.agents.spaceSettings.errors[code]);
  expect(screen.queryByRole("button", { name: "Join Space" })).not.toBeInTheDocument();
});

it.each(["en", "zh"] as const)(
  "previews sharing and joins only on an explicit action in %s",
  async (language) => {
    const port = fixture();
    const controller = new SpaceJoinController(port);
    controller.setToken(token);
    const onJoined = vi.fn();
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <JoinSpaceView controller={controller} onJoined={onJoined} />
      </BrowserLanguageProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Team" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(
      screen.getByText(
        language === "en"
          ? en.agents.spaceSettings.personalItems
          : zh.agents.spaceSettings.personalItems,
      ),
    ).toBeVisible();
    expect(port.acceptInvitation).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: language === "en" ? "Join Space" : "加入空间" }),
    );
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(spaceId));
  },
);

it("opens an already joined Space without changing membership in the preview", async () => {
  const port = fixture();
  port.previewInvitation.mockResolvedValueOnce({
    ...preview,
    shares: [...preview.shares],
    alreadyMember: true,
  });
  const controller = new SpaceJoinController(port);
  controller.setToken(token);
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <JoinSpaceView controller={controller} onJoined={vi.fn()} />
    </BrowserLanguageProvider>,
  );
  expect(await screen.findByText("You are already a member of this Space.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Open Space" })).toBeEnabled();
  expect(port.acceptInvitation).not.toHaveBeenCalled();
});

it("calls the forced-exit mount when the current membership ends", async () => {
  const { controller, onExit } = await mount({ role: "member" });
  await act(async () => {
    await controller.applyEvent({
      id: 1,
      spaceId,
      kind: "space.member.removed",
      payload: { accountId: "member" },
      createdAt: time,
    });
  });
  await waitFor(() => expect(onExit).toHaveBeenCalledWith("removed"));
});

function SheetFixture({ controller }: { controller: SpaceManagementController }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener} type="button" onClick={() => setOpen(true)}>
        Open settings
      </button>
      <CapabilitySheet
        open={open}
        onClose={() => setOpen(false)}
        title="Space settings"
        closeLabel="Close settings"
        finalFocus={opener}
      >
        <SpaceSettingsPanel
          controller={controller}
          role={owner.role}
          onExit={() => {}}
          onOpenRoutine={() => {}}
        />
      </CapabilitySheet>
    </>
  );
}

it("closes the settings sheet with one Escape and returns focus to its opener", async () => {
  const controller = new SpaceManagementController({
    spaceId,
    accountId: "owner",
    port: fixture(),
  });
  await controller.load(true);
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <SheetFixture controller={controller} />
    </BrowserLanguageProvider>,
  );
  const opener = screen.getByRole("button", { name: "Open settings" });
  await userEvent.click(opener);
  await screen.findByRole("dialog", { name: "Space settings" });
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Space settings" })).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(opener).toHaveFocus());
});

it("filters audit outcomes across loaded pages without changing their cursor", async () => {
  const port = fixture();
  const entry = {
    spaceId,
    operationId: "op",
    actorAccountId: "owner",
    action: "member.joined",
    targetId: "member",
    code: null,
    createdAt: time,
  };
  port.audit.mockResolvedValueOnce({
    items: [
      { ...entry, id: "ok", outcome: "succeeded" },
      { ...entry, id: "pending", outcome: "pending" },
    ],
    nextCursor: "older",
  });
  await mount({ port });
  await section("Audit");
  await screen.findByRole("button", { name: "Load older entries" });
  await userEvent.click(screen.getByRole("combobox", { name: "Outcome" }));
  await userEvent.click(await screen.findByRole("option", { name: "Pending" }));
  expect(screen.getAllByText("Alex · Member joined")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Load older entries" })).toBeEnabled();
  expect(port.audit).toHaveBeenCalledOnce();
});
