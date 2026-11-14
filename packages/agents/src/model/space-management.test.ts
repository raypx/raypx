import { describe, expect, it, vi } from "vitest";
import {
  spaceIdSchema,
  spaceMutationErrorCodeSchema,
  type SpaceAuditEntry,
  type SpaceEvent,
  type SpaceDirectoryMember,
} from "@raypx/core/spaces";
import type { ApprovalSettingsState } from "@raypx/core/approvals";
import {
  SpaceJoinController,
  SpaceManagementController,
  filteredSpaceAudit,
  spaceApprovalDisplay,
  spaceManagementError,
  type SpaceManagementPort,
} from "./space-management.js";

const spaceId = spaceIdSchema.parse("shared-space");
const createdAt = "2026-11-14T00:00:00.000Z";
const space = { id: spaceId, name: "Team", createdAt, updatedAt: createdAt };
const token = "a".repeat(64);
const owner: SpaceDirectoryMember = {
  spaceId,
  accountId: "owner",
  role: "owner",
  name: "Alex",
  image: null,
  email: "alex@example.test",
  createdAt,
};
const member: SpaceDirectoryMember = {
  spaceId,
  accountId: "member",
  role: "member",
  name: "Mei",
  image: null,
  email: "mei@example.test",
  createdAt,
};
const invitation = {
  spaceId,
  id: "invitation",
  inviterAccountId: "owner",
  inviterName: "Alex",
  createdAt,
  expiresAt: "2026-11-21T00:00:00.000Z",
};
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
  rules: [],
  revision: 0,
  availableModes: [
    { mode: "ask", available: true, reasonCode: null },
    { mode: "never", available: true, reasonCode: null },
    { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
  ],
};

function fixture(accountId = "owner") {
  const port = {
    get: vi.fn<SpaceManagementPort["get"]>(async () => space),
    rename: vi.fn<SpaceManagementPort["rename"]>(async ({ name }) => ({ ...space, name })),
    delete: vi.fn<SpaceManagementPort["delete"]>(async () => ({ spaceId, status: "deleting" })),
    leave: vi.fn<SpaceManagementPort["leave"]>(async () => ({ accountId, pausedRoutines: [] })),
    members: vi.fn<SpaceManagementPort["members"]>(async () => [owner, member]),
    updateMemberRole: vi.fn<SpaceManagementPort["updateMemberRole"]>(
      async ({ accountId: id, role }) => ({ spaceId, accountId: id, role, createdAt }),
    ),
    removeMember: vi.fn<SpaceManagementPort["removeMember"]>(async ({ accountId: id }) => ({
      accountId: id,
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
      updatedAt: createdAt,
    })),
    clearApprovalOverride: vi.fn<SpaceManagementPort["clearApprovalOverride"]>(async () => ({
      spaceId,
      approvalMode: null,
      updatedAt: createdAt,
    })),
    audit: vi.fn<SpaceManagementPort["audit"]>(async () => ({ items: [], nextCursor: null })),
    events: vi.fn<SpaceManagementPort["events"]>(async () => []),
  };
  const accountApprovals = { settings: vi.fn(async () => accountSettings) };
  const controller = new SpaceManagementController({ spaceId, accountId, port, accountApprovals });
  return { port, controller, accountApprovals };
}
function event(id: number, fields: Pick<SpaceEvent, "kind" | "payload">): SpaceEvent {
  return { id, spaceId, createdAt, ...fields } as SpaceEvent;
}
function audit(id: string, outcome: SpaceAuditEntry["outcome"]): SpaceAuditEntry {
  return {
    spaceId,
    id,
    operationId: `operation-${id}`,
    actorAccountId: "owner",
    action: "member.role_changed",
    targetId: "member",
    outcome,
    code: null,
    createdAt,
  };
}

it("loads owner directory fields and owner sections; a member never requests owner sections", async () => {
  const h = fixture();
  await h.controller.load(true);
  expect(h.controller.getSnapshot()).toMatchObject({
    space,
    members: [owner, member],
    invitations: [invitation],
    settings: { approvalMode: null },
    accountSettings,
    loading: false,
    error: null,
  });
  expect(h.port.audit).not.toHaveBeenCalled();
  const m = fixture("member");
  m.port.members.mockResolvedValue([owner, member].map(({ email: _email, ...item }) => item));
  await m.controller.load(false);
  expect(m.port.settings).not.toHaveBeenCalled();
  expect(m.port.invitations).not.toHaveBeenCalled();
  expect(m.controller.getSnapshot()).toMatchObject({ invitations: [], settings: null, audit: [] });
  expect(m.controller.getSnapshot().members.every((entry) => !("email" in entry))).toBe(true);
});

it("uses procedure results for names and member roles, including server refusals", async () => {
  const h = fixture();
  await h.controller.load(true);
  await h.controller.rename("Design");
  await h.controller.updateMemberRole("member", "owner");
  expect(h.controller.getSnapshot().space?.name).toBe("Design");
  expect(
    h.controller.getSnapshot().members.find((entry) => entry.accountId === "member")?.role,
  ).toBe("owner");
  h.port.updateMemberRole.mockRejectedValueOnce({ data: { code: "SPACE_LAST_OWNER" } });
  await expect(h.controller.updateMemberRole("owner", "member")).resolves.toBe(false);
  expect(h.controller.getSnapshot().error).toBe("SPACE_LAST_OWNER");
  expect(h.controller.getSnapshot().members[0]?.role).toBe("owner");
});

it("keeps paused routine IDs and shared names returned by removal", async () => {
  const h = fixture();
  await h.controller.load(true);
  await h.controller.removeMember("member");
  expect(h.controller.getSnapshot()).toMatchObject({
    members: [owner],
    removal: { accountId: "member", pausedRoutines: [{ id: "routine", name: "Daily check" }] },
  });
  expect(h.port.invitations).toHaveBeenCalledTimes(2);
});

it("refreshes the directory from joined, removed and role events before advancing the cursor", async () => {
  const h = fixture();
  await h.controller.load(true);
  h.port.members.mockResolvedValueOnce([owner, { ...member, role: "owner" }]);
  await h.controller.applyEvent(
    event(1, {
      kind: "space.member.role_changed",
      payload: { accountId: "member", role: "owner" },
    }),
  );
  expect(h.controller.getSnapshot().members[1]?.role).toBe("owner");
  h.port.members.mockResolvedValueOnce([owner]);
  await h.controller.applyEvent(
    event(2, { kind: "space.member.removed", payload: { accountId: "member" } }),
  );
  expect(h.controller.getSnapshot().members).toEqual([owner]);
  h.port.members.mockResolvedValueOnce([owner, member]);
  await h.controller.applyEvent(
    event(3, { kind: "space.member.joined", payload: { accountId: "member" } }),
  );
  expect(h.controller.getSnapshot()).toMatchObject({ eventCursor: 3, members: [owner, member] });
  await h.controller.applyEvent(event(4, { kind: "space.renamed", payload: { name: "Renamed" } }));
  expect(h.controller.getSnapshot()).toMatchObject({ eventCursor: 4, space: { name: "Renamed" } });
  await expect(
    h.controller.applyEvent(event(3, { kind: "space.renamed", payload: { name: "Old" } })),
  ).resolves.toBe(false);
});

it("clears owner data and email immediately on demotion, even when a directory read fails", async () => {
  const h = fixture();
  await h.controller.load(true);
  await h.controller.createInvitation();
  h.port.members.mockRejectedValueOnce(new Error("offline"));
  await h.controller.applyEvent(
    event(1, {
      kind: "space.member.role_changed",
      payload: { accountId: "owner", role: "member" },
    }),
  );
  expect(h.controller.getSnapshot()).toMatchObject({
    invitations: [],
    issuedInvitation: null,
    settings: null,
  });
  expect(h.controller.getSnapshot().members.every((entry) => !("email" in entry))).toBe(true);
});

it("immediately exits when removed and fences a stale load", async () => {
  const h = fixture("member");
  let finish!: (value: SpaceDirectoryMember[]) => void;
  h.port.members.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const loading = h.controller.load(false);
  await h.controller.applyEvent(
    event(1, { kind: "space.member.removed", payload: { accountId: "member" } }),
  );
  finish([owner, member]);
  await loading;
  expect(h.controller.getSnapshot()).toMatchObject({
    exited: "removed",
    eventCursor: 1,
    space: null,
    members: [],
    loading: false,
  });
});

it("represents deletion as an explicit claim and preserves the last-private refusal", async () => {
  const h = fixture();
  await h.controller.load(true);
  h.port.delete.mockRejectedValueOnce({ message: "SPACE_LAST_PRIVATE" });
  await expect(h.controller.deleteSpace()).resolves.toBe(false);
  expect(h.controller.getSnapshot()).toMatchObject({
    deleting: false,
    exited: null,
    error: "SPACE_LAST_PRIVATE",
  });
  await expect(h.controller.deleteSpace()).resolves.toBe(true);
  expect(h.controller.getSnapshot()).toMatchObject({
    deleting: true,
    exited: "deleting",
    space: null,
    members: [],
  });
});

it("retains server refusal when leaving as the last owner", async () => {
  const h = fixture();
  h.port.leave.mockRejectedValueOnce({ data: { code: "SPACE_LAST_OWNER" } });
  await expect(h.controller.leave()).resolves.toBe(false);
  expect(h.controller.getSnapshot()).toMatchObject({ exited: null, error: "SPACE_LAST_OWNER" });
  await h.controller.leave();
  expect(h.controller.getSnapshot().exited).toBe("left");
});

it("shows an issued token only in its open in-memory display and clears it on close", async () => {
  const h = fixture();
  await h.controller.load(true);
  await h.controller.createInvitation();
  expect(h.controller.getSnapshot().issuedInvitation?.token).toBe(token);
  expect(h.controller.getSnapshot().invitations[0]).not.toHaveProperty("token");
  h.controller.clearIssuedInvitation();
  expect(h.controller.getSnapshot().issuedInvitation).toBeNull();
  expect(JSON.stringify(h.controller.getSnapshot())).not.toContain(token);
  await h.controller.cancelInvitation(invitation.id);
  expect(h.controller.getSnapshot().invitations).toEqual([]);
});

it("does not redisplay a token if the dialog closed while creation was pending", async () => {
  const h = fixture();
  await h.controller.load(true);
  let finish!: (value: typeof invitation & { token: string }) => void;
  h.port.createInvitation.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const creation = h.controller.createInvitation();
  h.controller.clearIssuedInvitation();
  finish({ ...invitation, token });
  await creation;
  expect(h.controller.getSnapshot().issuedInvitation).toBeNull();
  expect(h.controller.getSnapshot().invitations).toEqual([invitation]);
});

it("sets and clears the override and preserves mode availability from account settings", async () => {
  const h = fixture();
  await h.controller.load(true);
  await h.controller.setApprovalOverride("never");
  expect(spaceApprovalDisplay("ask", h.controller.getSnapshot().settings)).toEqual({
    accountDefault: "ask",
    override: "never",
    effective: "never",
    overridesDefault: true,
  });
  expect(h.controller.getSnapshot().accountSettings?.availableModes[2]).toMatchObject({
    available: false,
    reasonCode: "REVIEW_MODEL_NOT_CONFIGURED",
  });
  h.port.setApprovalOverride.mockRejectedValueOnce({ message: "REVIEW_MODEL_NOT_CONFIGURED" });
  await h.controller.setApprovalOverride("auto");
  expect(h.controller.getSnapshot().error).toBe("REVIEW_MODEL_NOT_CONFIGURED");
  await h.controller.clearApprovalOverride();
  expect(spaceApprovalDisplay("ask", h.controller.getSnapshot().settings)).toMatchObject({
    effective: "ask",
    overridesDefault: false,
  });
  expect(spaceApprovalDisplay("ask", null).effective).toBeNull();
});

it("pages audit without duplicate rows and filters all loaded outcomes", async () => {
  const h = fixture();
  h.port.audit.mockResolvedValueOnce({
    items: [audit("a", "pending"), audit("b", "succeeded")],
    nextCursor: "next",
  });
  h.port.audit.mockResolvedValueOnce({
    items: [audit("b", "succeeded"), audit("c", "failed")],
    nextCursor: null,
  });
  await h.controller.loadAudit();
  h.controller.setAuditFilter("failed");
  expect(filteredSpaceAudit(h.controller.getSnapshot())).toEqual([]);
  await h.controller.nextAuditPage();
  expect(h.port.audit).toHaveBeenLastCalledWith({ spaceId, cursor: "next", limit: 50 });
  expect(h.controller.getSnapshot().audit.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  expect(filteredSpaceAudit(h.controller.getSnapshot()).map((entry) => entry.id)).toEqual(["c"]);
  h.controller.setAuditFilter("all");
  expect(filteredSpaceAudit(h.controller.getSnapshot())).toHaveLength(3);
  await expect(h.controller.nextAuditPage()).resolves.toBe(false);
});

it("keeps audit-unavailable and invalid-cursor failures distinct without breaking other settings", async () => {
  const h = fixture();
  await h.controller.load(true);
  for (const code of ["SPACE_AUDIT_UNAVAILABLE", "INVALID_AUDIT_CURSOR"] as const) {
    h.port.audit.mockRejectedValueOnce({ data: { code } });
    await expect(h.controller.loadAudit()).resolves.toBe(false);
    expect(h.controller.getSnapshot()).toMatchObject({
      auditError: code,
      auditLoading: false,
      space,
      error: null,
    });
  }
});

it("fences disposal for secret creation and all later notifications", async () => {
  const h = fixture();
  await h.controller.load(true);
  let finish!: (value: typeof invitation & { token: string }) => void;
  h.port.createInvitation.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const creation = h.controller.createInvitation();
  const listener = vi.fn();
  h.controller.subscribe(listener);
  h.controller.dispose();
  const before = listener.mock.calls.length;
  finish({ ...invitation, token });
  await creation;
  expect(listener).toHaveBeenCalledTimes(before);
  expect(h.controller.getSnapshot().issuedInvitation).toBeNull();
});

describe("invitation join flow", () => {
  it("previews shares, keeps tokens out of view state and joins exactly once", async () => {
    const h = fixture();
    const controller = new SpaceJoinController(h.port);
    controller.setToken(token);
    await controller.preview();
    expect(controller.getSnapshot()).toMatchObject({
      status: "preview",
      preview: { spaceName: "Team", shares: preview.shares },
    });
    expect(JSON.stringify(controller.getSnapshot())).not.toContain(token);
    await controller.accept();
    await controller.accept();
    expect(h.port.acceptInvitation).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      status: "joined",
      acceptance: { space, joined: true },
    });
    controller.clear();
    await controller.preview();
    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      error: "INVITATION_NOT_FOUND",
      acceptance: null,
    });
  });
  it("keeps already-member preview and idempotent acceptance", async () => {
    const h = fixture();
    h.port.previewInvitation.mockResolvedValueOnce({
      ...preview,
      shares: [...preview.shares],
      alreadyMember: true,
    });
    h.port.acceptInvitation.mockResolvedValueOnce({ space, member: owner, joined: false });
    const controller = new SpaceJoinController(h.port);
    controller.setToken(token);
    await controller.preview();
    expect(controller.getSnapshot().preview?.alreadyMember).toBe(true);
    await controller.accept();
    expect(controller.getSnapshot().acceptance?.joined).toBe(false);
  });
  it.each([
    "INVITATION_NOT_FOUND",
    "INVITATION_EXPIRED",
    "INVITATION_CANCELLED",
    "INVITATION_CONSUMED",
  ] as const)("shows %s distinctly", async (code) => {
    const h = fixture();
    h.port.previewInvitation.mockRejectedValueOnce({
      code: "CONFLICT",
      data: { error: { code }, requestId: "request" },
    });
    const controller = new SpaceJoinController(h.port);
    controller.setToken(token);
    await controller.preview();
    expect(controller.getSnapshot()).toMatchObject({ status: "error", error: code });
    await controller.preview();
    h.port.acceptInvitation.mockRejectedValueOnce({
      code: "CONFLICT",
      data: { error: { code }, requestId: "request" },
    });
    await controller.accept();
    expect(controller.getSnapshot()).toMatchObject({ status: "error", error: code });
  });
  it("fences a preview from a previous token and disposal", async () => {
    const h = fixture();
    let finish!: (value: Awaited<ReturnType<SpaceManagementPort["previewInvitation"]>>) => void;
    h.port.previewInvitation.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const controller = new SpaceJoinController(h.port);
    controller.setToken(token);
    const loading = controller.preview();
    controller.setToken("b".repeat(64));
    finish({ ...preview, shares: [...preview.shares] });
    await loading;
    expect(controller.getSnapshot()).toMatchObject({ status: "idle", preview: null });
    controller.dispose();
    await controller.preview();
    expect(h.port.previewInvitation).toHaveBeenCalledOnce();
  });
});

it("only puts stable public codes in errors, never arbitrary failure messages", () => {
  expect(spaceManagementError({ message: token })).toBe("REQUEST_FAILED");
  expect(spaceManagementError({ code: "FORBIDDEN", message: "SPACE_OWNER_REQUIRED" })).toBe(
    "SPACE_OWNER_REQUIRED",
  );
});

it.each(spaceMutationErrorCodeSchema.options)("recognizes the procedure wire error %s", (code) => {
  expect(
    spaceManagementError({
      code: "CONFLICT",
      message: "Conflict",
      data: { error: { code }, requestId: "request" },
    }),
  ).toBe(code);
});

it("clears all owner data when directory refresh observes a demotion without an event", async () => {
  const h = fixture();
  await h.controller.load(true);
  await h.controller.createInvitation();
  h.port.audit.mockResolvedValueOnce({ items: [audit("a", "succeeded")], nextCursor: "next" });
  await h.controller.loadAudit();
  h.port.members.mockResolvedValueOnce(
    [{ ...owner, role: "member" as const }, member].map(({ email: _email, ...entry }) => entry),
  );
  await h.controller.refreshMembers();
  expect(h.controller.getSnapshot()).toMatchObject({
    invitations: [],
    issuedInvitation: null,
    settings: null,
    audit: [],
    auditCursor: null,
  });
  expect(h.controller.getSnapshot().members[0]?.role).toBe("member");
});

it("does not republish a saved override after a concurrent demotion", async () => {
  const h = fixture();
  await h.controller.load(true);
  let finish!: (value: Awaited<ReturnType<SpaceManagementPort["setApprovalOverride"]>>) => void;
  h.port.setApprovalOverride.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const saving = h.controller.setApprovalOverride("never");
  h.port.members.mockResolvedValueOnce([{ ...owner, role: "member" }, member]);
  await h.controller.refreshMembers();
  finish({ spaceId, approvalMode: "never", updatedAt: createdAt });
  await saving;
  expect(h.controller.getSnapshot()).toMatchObject({ settings: null, invitations: [], busy: null });
});

it("queues a load requested during a mutation rather than replacing its result with an older read", async () => {
  const h = fixture();
  await h.controller.load(true);
  let finish!: (value: Awaited<ReturnType<SpaceManagementPort["setApprovalOverride"]>>) => void;
  h.port.setApprovalOverride.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const saving = h.controller.setApprovalOverride("never");
  await h.controller.load(true);
  expect(h.port.settings).toHaveBeenCalledOnce();
  h.port.settings.mockResolvedValue({ spaceId, approvalMode: "never", updatedAt: createdAt });
  finish({ spaceId, approvalMode: "never", updatedAt: createdAt });
  await saving;
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  expect(h.port.settings).toHaveBeenCalledTimes(2);
  expect(h.controller.getSnapshot()).toMatchObject({
    settings: { approvalMode: "never" },
    loading: false,
  });
});

it("keeps the directory available when account approval settings cannot be loaded", async () => {
  const h = fixture();
  h.accountApprovals.settings.mockRejectedValueOnce(new Error("unavailable"));
  await h.controller.load(true);
  expect(h.controller.getSnapshot()).toMatchObject({
    members: [owner, member],
    accountSettings: null,
    settings: { approvalMode: null },
    loading: false,
  });
});

it.each(["deleting", "left"] as const)(
  "retains a confirmed %s acknowledgement after forced disposal without reviving state",
  async (reason) => {
    const h = fixture();
    const confirmed = vi.fn();
    const controller = new SpaceManagementController({
      spaceId,
      accountId: "owner",
      port: h.port,
      onExitConfirmed: confirmed,
    });
    let finishDelete!: (value: Awaited<ReturnType<SpaceManagementPort["delete"]>>) => void;
    let finishLeave!: (value: Awaited<ReturnType<SpaceManagementPort["leave"]>>) => void;
    h.port.delete.mockReturnValueOnce(
      new Promise((resolve) => {
        finishDelete = resolve;
      }),
    );
    h.port.leave.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLeave = resolve;
      }),
    );
    const operation = reason === "deleting" ? controller.deleteSpace() : controller.leave();
    controller.dispose();
    const before = controller.getSnapshot();
    if (reason === "deleting") finishDelete({ spaceId, status: "deleting" });
    else finishLeave({ accountId: "owner", pausedRoutines: [] });
    await operation;
    expect(confirmed).toHaveBeenCalledExactlyOnceWith(reason);
    expect(controller.getSnapshot()).toBe(before);
  },
);

it.each(["space_override", "account_default"] as const)(
  "reads a member's effective mode from %s without owner settings",
  async (source) => {
    const h = fixture("member");
    const effectiveMode = vi.fn(async () => ({
      spaceId,
      mode: "never" as const,
      source,
      availableModes: accountSettings.availableModes,
    }));
    const controller = new SpaceManagementController({
      spaceId,
      accountId: "member",
      port: h.port,
      effectiveApprovals: { effectiveMode },
    });
    await controller.load(false);
    expect(controller.getSnapshot().effectiveMode).toMatchObject({ mode: "never", source });
    expect(effectiveMode).toHaveBeenCalledExactlyOnceWith({ spaceId });
    expect(h.port.settings).not.toHaveBeenCalled();
    controller.dispose();
  },
);
