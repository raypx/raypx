import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SpaceJoinController,
  SpaceManagementController,
  type SpaceManagementPort,
  type SpaceInvitationPreview,
} from "@raypx/agents/model";
import { spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { act, findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { useLocales } from "../../tests/mocks/localization.js";
import { JoinSpaceScreen, SpaceSettingsScreen } from "./screens.js";

const date = "2026-11-14T00:00:00.000Z";
const space = spaceSchema.parse({
  id: "space",
  name: "Shared room",
  createdAt: date,
  updatedAt: date,
});
const membership = {
  space,
  member: spaceMemberSchema.parse({
    spaceId: space.id,
    accountId: "viewer",
    role: "owner",
    createdAt: date,
  }),
};
const member = { ...membership.member, name: "Ari", image: null };
const invitation = {
  id: "invite-one",
  spaceId: space.id,
  inviterAccountId: "viewer",
  inviterName: "Ari",
  createdAt: date,
  expiresAt: "2026-11-21T00:00:00.000Z",
};
const preview: SpaceInvitationPreview = {
  spaceId: space.id,
  spaceName: space.name,
  inviterName: "Ari",
  expiresAt: invitation.expiresAt,
  alreadyMember: false,
  shares: ["agents", "conversations", "memory", "routines", "team_computer", "pages"],
};
function fixture(owner = true) {
  const port = {
    get: vi.fn(async () => space),
    rename: vi.fn(async () => space),
    delete: vi.fn(async () => ({ spaceId: space.id, status: "deleting" as const })),
    leave: vi.fn(async () => ({ accountId: "viewer", pausedRoutines: [] })),
    members: vi.fn(async () => [
      { ...member, role: owner ? ("owner" as const) : ("member" as const) },
    ]),
    updateMemberRole: vi.fn(async () => membership.member),
    removeMember: vi.fn(async () => ({ accountId: "other", pausedRoutines: [] })),
    invitations: vi.fn(async () => [invitation]),
    createInvitation: vi.fn(async () => ({ ...invitation, token: "a".repeat(64) })),
    cancelInvitation: vi.fn(async () => ({ cancelled: 1 })),
    cancelInvitations: vi.fn(async () => ({ cancelled: 1 })),
    previewInvitation: vi.fn(async (): Promise<SpaceInvitationPreview> => ({
      ...preview,
      shares: [...preview.shares],
    })),
    acceptInvitation: vi.fn(async () => ({ ...membership, joined: true })),
    settings: vi.fn(async () => ({ spaceId: space.id, approvalMode: null, updatedAt: null })),
    setApprovalOverride: vi.fn(async () => ({
      spaceId: space.id,
      approvalMode: null,
      updatedAt: null,
    })),
    clearApprovalOverride: vi.fn(async () => ({
      spaceId: space.id,
      approvalMode: null,
      updatedAt: null,
    })),
    audit: vi.fn(async () => ({ items: [], nextCursor: null })),
    events: vi.fn(async () => []),
  } satisfies SpaceManagementPort;
  const controller = new SpaceManagementController({
    spaceId: space.id,
    accountId: "viewer",
    port,
    effectiveApprovals: {
      effectiveMode: async () => ({
        spaceId: space.id,
        mode: "ask",
        source: "space_override",
        availableModes: [
          { mode: "ask", available: true, reasonCode: null },
          { mode: "never", available: true, reasonCode: null },
          { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
        ],
      }),
    },
  });
  return { port, controller };
}
function settingsProps(controller: SpaceManagementController) {
  return {
    controller,
    membership,
    onBack: vi.fn(),
    onLeave: vi.fn(),
    onRevoke: vi.fn(),
    onCopy: vi.fn(async () => {}),
    onRole: vi.fn(),
    onRemove: vi.fn(),
  };
}
afterEach(() => useLocales.mockReset());

describe("native shared Spaces", () => {
  it("shows server roles and effective approval mode; confirms destructive actions outside the view", async () => {
    const { controller } = fixture();
    await controller.load(true);
    const props = settingsProps(controller);
    const view = await renderNative(<SpaceSettingsScreen {...props} />);
    expect(textContent(view.root)).toContain("Ari · Owner");
    expect(textContent(view.root)).toContain("Ask before changes");
    expect(textContent(view.root)).toContain("Space overrides your approval default");
    await press(findByLabel(view.root, "Leave Space"));
    expect(props.onLeave).toHaveBeenCalledOnce();
    await press(findByLabel(view.root, "Cancel invitation"));
    expect(props.onRevoke).toHaveBeenCalledWith(invitation.id);
    await view.unmount();
    controller.dispose();
  });
  it("hides owner-only invitation management from members", async () => {
    const { controller, port } = fixture(false);
    await controller.load(false);
    const view = await renderNative(<SpaceSettingsScreen {...settingsProps(controller)} />);
    expect(textContent(view.root)).toContain("Ari · Member");
    expect(
      view.root.findAll((node) => node.props.accessibilityLabel === "Create invitation"),
    ).toHaveLength(0);
    expect(port.invitations).not.toHaveBeenCalled();
    expect(port.settings).not.toHaveBeenCalled();
    await view.unmount();
    controller.dispose();
  });
  it("creates, copies and clears a single-use deep link without persisting the token", async () => {
    const { controller } = fixture();
    await controller.load(true);
    const props = settingsProps(controller);
    const view = await renderNative(<SpaceSettingsScreen {...props} />);
    await press(findByLabel(view.root, "Create invitation"));
    expect(textContent(view.root)).toContain("raypx-mobile://join?token=");
    await press(findByLabel(view.root, "Copy link"));
    expect(props.onCopy).toHaveBeenCalledWith(`raypx-mobile://join?token=${"a".repeat(64)}`);
    expect(textContent(view.root)).toContain("Link copied");
    await press(findByLabel(view.root, "Close"));
    expect(controller.getSnapshot().issuedInvitation).toBe(null);
    expect(textContent(view.root)).not.toContain("a".repeat(64));
    await view.unmount();
    controller.dispose();
  });
  it("keeps a failed copy visible and retryable", async () => {
    const { controller } = fixture();
    await controller.load(true);
    const props = settingsProps(controller);
    props.onCopy.mockRejectedValueOnce(new Error("unavailable"));
    const view = await renderNative(<SpaceSettingsScreen {...props} />);
    await press(findByLabel(view.root, "Create invitation"));
    await press(findByLabel(view.root, "Copy link"));
    expect(textContent(view.root)).toContain("Select the link and copy it manually");
    expect(controller.getSnapshot().issuedInvitation).not.toBe(null);
    await view.unmount();
    controller.dispose();
  });
  it.each([
    { locale: "en", join: "Join Space", title: "Join a Space" },
    { locale: "zh", join: "加入空间", title: "加入空间" },
  ])("previews sharing before explicit acceptance in $locale", async ({ locale, join, title }) => {
    useLocales.mockReturnValue([{ languageTag: locale, languageCode: locale }]);
    const { port } = fixture();
    const controller = new SpaceJoinController(port);
    controller.setToken("a".repeat(64));
    await controller.preview();
    const onJoined = vi.fn();
    const view = await renderNative(
      <JoinSpaceScreen controller={controller} onBack={vi.fn()} onJoined={onJoined} />,
    );
    expect(textContent(view.root)).toContain(title);
    expect(textContent(view.root)).toContain(space.name);
    expect(port.acceptInvitation).not.toHaveBeenCalled();
    await press(findByLabel(view.root, join));
    expect(port.acceptInvitation).toHaveBeenCalledWith({ token: "a".repeat(64) });
    expect(onJoined).toHaveBeenCalledWith(space.id);
    await view.unmount();
    controller.dispose();
  });
  it("shows an expired invitation and retries only its preview", async () => {
    const { port } = fixture();
    port.previewInvitation.mockRejectedValueOnce(new Error("INVITATION_EXPIRED"));
    const controller = new SpaceJoinController(port);
    controller.setToken("a".repeat(64));
    await controller.preview();
    const view = await renderNative(
      <JoinSpaceScreen controller={controller} onBack={vi.fn()} onJoined={vi.fn()} />,
    );
    expect(textContent(view.root)).toContain("This invitation has expired");
    await press(findByLabel(view.root, "Refresh"));
    expect(port.previewInvitation).toHaveBeenCalledTimes(2);
    expect(port.acceptInvitation).not.toHaveBeenCalled();
    await view.unmount();
    controller.dispose();
  });
  it("preserves preview and shows a safe error after failed acceptance", async () => {
    const { port } = fixture();
    port.acceptInvitation.mockRejectedValueOnce(new Error("offline"));
    const controller = new SpaceJoinController(port);
    controller.setToken("a".repeat(64));
    await controller.preview();
    const view = await renderNative(
      <JoinSpaceScreen controller={controller} onBack={vi.fn()} onJoined={vi.fn()} />,
    );
    await press(findByLabel(view.root, "Join Space"));
    expect(textContent(view.root)).toContain("The request could not be completed");
    expect(textContent(view.root)).toContain(space.name);
    expect(findByLabel(view.root, "Join Space").props.isDisabled).toBe(true);
    await act(async () => {
      await controller.preview();
    });
    expect(findByLabel(view.root, "Join Space").props.isDisabled).toBe(false);
    await view.unmount();
    controller.dispose();
  });
});
