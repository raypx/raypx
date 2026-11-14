import type { z } from "zod";
import type {
  ApprovalMode,
  ApprovalSettingsState,
  EffectiveApprovalMode,
} from "@raypx/core/approvals";
import {
  spaceMutationErrorCodeSchema,
  type Space,
  type SpaceAuditEntry,
  type SpaceDirectoryMember,
  type SpaceEvent,
  type SpaceId,
  type SpaceInvitation,
  type SpaceMember,
  type SpaceMutationErrorCode,
  type SpaceRole,
  type SpaceSettings,
  type issuedSpaceInvitationSchema,
  type spaceAuditPageSchema,
  type spaceInvitationAcceptanceSchema,
  type spaceInvitationPreviewSchema,
  type spaceMemberRemovalSchema,
} from "@raypx/core/spaces";

export type IssuedSpaceInvitation = z.infer<typeof issuedSpaceInvitationSchema>;
export type SpaceInvitationPreview = z.infer<typeof spaceInvitationPreviewSchema>;
export type SpaceInvitationAcceptance = z.infer<typeof spaceInvitationAcceptanceSchema>;
export type SpaceMemberRemoval = z.infer<typeof spaceMemberRemovalSchema>;
export type SpaceAuditPage = z.infer<typeof spaceAuditPageSchema>;
export type SpaceAuditFilter = "all" | SpaceAuditEntry["outcome"];
export type SpaceManagementError = SpaceMutationErrorCode | "REQUEST_FAILED";
export type SpaceExitReason = "removed" | "left" | "deleting";

/** Selectors identify resources; every operation is authorized by the server. */
export interface SpaceManagementPort {
  get(this: void, input: { spaceId: SpaceId }): Promise<Space>;
  rename(this: void, input: { spaceId: SpaceId; name: string }): Promise<Space>;
  delete(
    this: void,
    input: { spaceId: SpaceId },
  ): Promise<{ spaceId: SpaceId; status: "deleting" }>;
  leave(this: void, input: { spaceId: SpaceId }): Promise<SpaceMemberRemoval>;
  members(this: void, input: { spaceId: SpaceId }): Promise<SpaceDirectoryMember[]>;
  updateMemberRole(
    this: void,
    input: { spaceId: SpaceId; accountId: string; role: SpaceRole },
  ): Promise<SpaceMember>;
  removeMember(
    this: void,
    input: { spaceId: SpaceId; accountId: string },
  ): Promise<SpaceMemberRemoval>;
  invitations(this: void, input: { spaceId: SpaceId }): Promise<SpaceInvitation[]>;
  createInvitation(this: void, input: { spaceId: SpaceId }): Promise<IssuedSpaceInvitation>;
  cancelInvitation(
    this: void,
    input: { spaceId: SpaceId; id: string },
  ): Promise<{ cancelled: number }>;
  cancelInvitations(this: void, input: { spaceId: SpaceId }): Promise<{ cancelled: number }>;
  previewInvitation(this: void, input: { token: string }): Promise<SpaceInvitationPreview>;
  acceptInvitation(this: void, input: { token: string }): Promise<SpaceInvitationAcceptance>;
  settings(this: void, input: { spaceId: SpaceId }): Promise<SpaceSettings>;
  setApprovalOverride(
    this: void,
    input: { spaceId: SpaceId; mode: "ask" | "never" | "auto" },
  ): Promise<SpaceSettings>;
  clearApprovalOverride(this: void, input: { spaceId: SpaceId }): Promise<SpaceSettings>;
  audit(
    this: void,
    input: { spaceId: SpaceId; cursor?: string; limit?: number },
  ): Promise<SpaceAuditPage>;
  events(
    this: void,
    input: { spaceId: SpaceId; after?: number; limit?: number },
  ): Promise<SpaceEvent[]>;
}

export interface SpaceManagementView {
  space: Space | null;
  members: readonly SpaceDirectoryMember[];
  invitations: readonly SpaceInvitation[];
  issuedInvitation: IssuedSpaceInvitation | null;
  settings: SpaceSettings | null;
  accountSettings: ApprovalSettingsState | null;
  effectiveMode: EffectiveApprovalMode | null;
  audit: readonly SpaceAuditEntry[];
  auditCursor: string | null;
  auditFilter: SpaceAuditFilter;
  auditLoading: boolean;
  auditError: SpaceManagementError | null;
  eventCursor: number;
  loading: boolean;
  busy: string | null;
  error: SpaceManagementError | null;
  removal: SpaceMemberRemoval | null;
  deleting: boolean;
  exited: SpaceExitReason | null;
}

export function spaceManagementError(error: unknown): SpaceManagementError {
  if (!error || typeof error !== "object") return "REQUEST_FAILED";
  const candidates: unknown[] = [];
  if ("data" in error && error.data && typeof error.data === "object") {
    const data = error.data;
    if ("error" in data && data.error && typeof data.error === "object" && "code" in data.error)
      candidates.push(data.error.code);
    if ("code" in data) candidates.push(data.code);
  }
  if ("code" in error) candidates.push(error.code);
  if ("message" in error) candidates.push(error.message);
  for (const candidate of candidates) {
    const parsed = spaceMutationErrorCodeSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return "REQUEST_FAILED";
}

export function filteredSpaceAudit(view: Pick<SpaceManagementView, "audit" | "auditFilter">) {
  if (view.auditFilter === "all") return view.audit;
  return view.audit.filter((entry) => entry.outcome === view.auditFilter);
}

/** Missing Space settings mean unknown, rather than silently assuming no override. */
export function spaceApprovalDisplay(
  accountDefault: ApprovalMode | null,
  settings: SpaceSettings | null,
) {
  return {
    accountDefault,
    override: settings?.approvalMode ?? null,
    effective: settings ? (settings.approvalMode ?? accountDefault) : null,
    overridesDefault: settings !== null && settings.approvalMode !== null,
  };
}

function withoutEmails(members: readonly SpaceDirectoryMember[]) {
  return members.map(({ email: _email, ...member }) => member);
}

export class SpaceManagementController {
  readonly spaceId: SpaceId;
  readonly accountId: string;
  private view: SpaceManagementView = {
    space: null,
    members: [],
    invitations: [],
    issuedInvitation: null,
    settings: null,
    accountSettings: null,
    effectiveMode: null,
    audit: [],
    auditCursor: null,
    auditFilter: "all",
    auditLoading: false,
    auditError: null,
    eventCursor: 0,
    loading: false,
    busy: null,
    error: null,
    removal: null,
    deleting: false,
    exited: null,
  };
  private readonly listeners = new Set<() => void>();
  private readonly port: SpaceManagementPort;
  private readonly accountApprovals:
    | { settings(input: Record<string, never>): Promise<ApprovalSettingsState> }
    | undefined;
  private readonly effectiveApprovals:
    | { effectiveMode?(input: { spaceId: SpaceId }): Promise<EffectiveApprovalMode> }
    | undefined;
  private onExitConfirmed: ((reason: "deleting" | "left") => void) | undefined;
  private disposed = false;
  private owner = false;
  private revision = 0;
  private membersRead = 0;
  private invitationRevision = 0;
  private auditRead = 0;
  private reloadRequested: boolean | undefined;

  constructor(options: {
    spaceId: SpaceId;
    accountId: string;
    port: SpaceManagementPort;
    accountApprovals?: { settings(input: Record<string, never>): Promise<ApprovalSettingsState> };
    effectiveApprovals?: {
      effectiveMode?(input: { spaceId: SpaceId }): Promise<EffectiveApprovalMode>;
    };
    onExitConfirmed?: (reason: "deleting" | "left") => void;
  }) {
    this.spaceId = options.spaceId;
    this.accountId = options.accountId;
    this.port = options.port;
    this.accountApprovals = options.accountApprovals;
    this.effectiveApprovals = options.effectiveApprovals;
    this.onExitConfirmed = options.onExitConfirmed;
  }
  /** Hosts observe confirmed acknowledgements after a stream has revoked access. */
  setExitConfirmationHandler(handler: (reason: "deleting" | "left") => void) {
    this.onExitConfirmed = handler;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<SpaceManagementView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private active(revision = this.revision) {
    return !this.disposed && !this.view.exited && revision === this.revision;
  }
  private clearOwnerData() {
    ++this.invitationRevision;
    ++this.auditRead;
    this.update({
      members: withoutEmails(this.view.members),
      invitations: [],
      issuedInvitation: null,
      settings: null,
      audit: [],
      auditCursor: null,
      auditLoading: false,
      auditError: null,
    });
  }
  private applyDirectory(members: readonly SpaceDirectoryMember[]) {
    const wasOwner = this.owner;
    this.owner = members.find((member) => member.accountId === this.accountId)?.role === "owner";
    this.update({ members });
    if (wasOwner && !this.owner) {
      ++this.revision;
      this.clearOwnerData();
      this.update({ loading: false });
    }
  }
  async load(owner: boolean): Promise<void> {
    if (!this.active()) return;
    if (this.view.busy) {
      this.reloadRequested = owner;
      return;
    }
    this.owner = owner;
    const revision = ++this.revision;
    if (!owner) this.clearOwnerData();
    ++this.auditRead;
    this.update({ loading: true, auditLoading: false, error: null });
    try {
      const [space, members, accountSettings, effectiveMode] = await Promise.all([
        this.port.get({ spaceId: this.spaceId }),
        this.port.members({ spaceId: this.spaceId }),
        this.accountApprovals?.settings({}).catch(() => null) ?? Promise.resolve(null),
        this.effectiveApprovals?.effectiveMode?.({ spaceId: this.spaceId }) ??
          Promise.resolve(null),
      ]);
      if (!this.active(revision)) return;
      this.update({ space, accountSettings, effectiveMode });
      this.applyDirectory(members);
      if (!this.owner) this.clearOwnerData();
      if (this.owner) {
        const [settings, invitations] = await Promise.all([
          this.port.settings({ spaceId: this.spaceId }),
          this.port.invitations({ spaceId: this.spaceId }),
        ]);
        if (this.active(revision)) this.update({ settings, invitations });
      }
    } catch (error) {
      if (this.active(revision)) this.update({ error: spaceManagementError(error) });
    } finally {
      if (this.active(revision)) this.update({ loading: false });
    }
  }
  async refreshMembers(): Promise<boolean> {
    if (!this.active()) return false;
    const read = ++this.membersRead;
    const revision = this.revision;
    try {
      const members = await this.port.members({ spaceId: this.spaceId });
      if (!this.active(revision) || read !== this.membersRead) return false;
      this.applyDirectory(members);
      return true;
    } catch (error) {
      if (this.active(revision) && read === this.membersRead)
        this.update({ error: spaceManagementError(error) });
      return false;
    }
  }
  private async mutate(
    operation: string,
    run: (current: () => boolean) => Promise<void>,
  ): Promise<boolean> {
    if (!this.active() || this.view.busy || this.view.loading) return false;
    const revision = this.revision;
    this.update({ busy: operation, error: null });
    try {
      await run(() => this.active(revision));
      return !this.disposed;
    } catch (error) {
      if (this.active(revision)) this.update({ error: spaceManagementError(error) });
      return false;
    } finally {
      this.update({ busy: null });
      const reload = this.reloadRequested;
      this.reloadRequested = undefined;
      if (reload !== undefined && this.active()) void this.load(reload);
    }
  }
  rename(name: string) {
    return this.mutate("rename", async (current) => {
      const space = await this.port.rename({ spaceId: this.spaceId, name });
      if (current()) this.update({ space });
    });
  }
  deleteSpace() {
    return this.mutate("delete", async () => {
      await this.port.delete({ spaceId: this.spaceId });
      this.exit("deleting");
      this.onExitConfirmed?.("deleting");
    });
  }
  leave() {
    return this.mutate("leave", async () => {
      const removal = await this.port.leave({ spaceId: this.spaceId });
      this.exit("left", removal);
      this.onExitConfirmed?.("left");
    });
  }
  updateMemberRole(accountId: string, role: SpaceRole) {
    return this.mutate(`role:${accountId}`, async (current) => {
      const member = await this.port.updateMemberRole({ spaceId: this.spaceId, accountId, role });
      if (!current()) return;
      this.update({
        members: this.view.members.map((entry) =>
          entry.accountId === accountId ? { ...entry, ...member } : entry,
        ),
      });
      if (accountId === this.accountId && role === "member") {
        this.owner = false;
        ++this.revision;
        this.clearOwnerData();
      }
    });
  }
  removeMember(accountId: string) {
    return this.mutate(`remove:${accountId}`, async (current) => {
      const removal = await this.port.removeMember({ spaceId: this.spaceId, accountId });
      if (!current()) return;
      if (accountId === this.accountId) {
        this.exit("removed", removal);
        return;
      }
      this.update({
        removal,
        members: this.view.members.filter((entry) => entry.accountId !== accountId),
      });
      if (this.owner) await this.refreshInvitations(current);
    });
  }
  private async refreshInvitations(current: () => boolean) {
    const invitations = await this.port.invitations({ spaceId: this.spaceId });
    if (current() && this.owner) this.update({ invitations });
  }
  createInvitation() {
    if (!this.active() || this.view.busy) return Promise.resolve(false);
    const revision = ++this.invitationRevision;
    return this.mutate("createInvitation", async (current) => {
      const issuedInvitation = await this.port.createInvitation({ spaceId: this.spaceId });
      if (!current() || !this.owner) return;
      // Only the in-memory open dialog can receive the once-returned token.
      if (revision === this.invitationRevision) this.update({ issuedInvitation });
      const { token: _token, ...invitation } = issuedInvitation;
      this.update({
        invitations: [
          ...this.view.invitations.filter((entry) => entry.id !== invitation.id),
          invitation,
        ],
      });
    });
  }
  clearIssuedInvitation() {
    ++this.invitationRevision;
    this.update({ issuedInvitation: null });
  }
  cancelInvitation(id: string) {
    return this.mutate(`cancel:${id}`, async (current) => {
      await this.port.cancelInvitation({ spaceId: this.spaceId, id });
      if (current())
        this.update({ invitations: this.view.invitations.filter((entry) => entry.id !== id) });
    });
  }
  cancelInvitations() {
    return this.mutate("cancelInvitations", async (current) => {
      await this.port.cancelInvitations({ spaceId: this.spaceId });
      if (current()) this.update({ invitations: [] });
    });
  }
  setApprovalOverride(mode: "ask" | "never" | "auto") {
    return this.mutate("approvalOverride", async (current) => {
      const settings = await this.port.setApprovalOverride({ spaceId: this.spaceId, mode });
      if (current() && this.owner) {
        const effectiveMode =
          (await this.effectiveApprovals?.effectiveMode?.({ spaceId: this.spaceId })) ?? null;
        if (current()) this.update({ settings, effectiveMode });
      }
    });
  }
  clearApprovalOverride() {
    return this.mutate("approvalOverride", async (current) => {
      const settings = await this.port.clearApprovalOverride({ spaceId: this.spaceId });
      if (current() && this.owner) {
        const effectiveMode =
          (await this.effectiveApprovals?.effectiveMode?.({ spaceId: this.spaceId })) ?? null;
        if (current()) this.update({ settings, effectiveMode });
      }
    });
  }
  setAuditFilter(auditFilter: SpaceAuditFilter) {
    this.update({ auditFilter });
  }
  loadAudit() {
    return this.readAudit(false);
  }
  nextAuditPage() {
    if (!this.view.auditCursor) return Promise.resolve(false);
    return this.readAudit(true);
  }
  private async readAudit(append: boolean): Promise<boolean> {
    if (!this.active() || this.view.auditLoading) return false;
    const read = ++this.auditRead;
    const revision = this.revision;
    const cursor = append ? this.view.auditCursor : null;
    this.update({ auditLoading: true, auditError: null });
    try {
      const page = await this.port.audit({
        spaceId: this.spaceId,
        ...(cursor ? { cursor } : {}),
        limit: 50,
      });
      if (!this.active(revision) || read !== this.auditRead) return false;
      const previous = append ? this.view.audit : [];
      const known = new Set(previous.map((entry) => entry.id));
      this.update({
        audit: [...previous, ...page.items.filter((entry) => !known.has(entry.id))],
        auditCursor: page.nextCursor,
      });
      return true;
    } catch (error) {
      if (this.active(revision) && read === this.auditRead)
        this.update({ auditError: spaceManagementError(error) });
      return false;
    } finally {
      if (this.active(revision) && read === this.auditRead) this.update({ auditLoading: false });
    }
  }
  async applyEvent(event: SpaceEvent): Promise<boolean> {
    if (!this.active() || event.spaceId !== this.spaceId || event.id <= this.view.eventCursor)
      return false;
    if (event.kind === "space.member.removed" && event.payload.accountId === this.accountId) {
      this.exit(event.payload.reason === "left" ? "left" : "removed");
      this.update({ eventCursor: event.id });
      return true;
    }
    if (event.kind === "space.renamed") {
      const space = this.view.space
        ? { ...this.view.space, name: event.payload.name, updatedAt: event.createdAt }
        : null;
      this.update({ space, eventCursor: event.id });
      return true;
    }
    if (event.kind === "space.member.role_changed" && event.payload.accountId === this.accountId) {
      this.update({
        members: this.view.members.map((member) =>
          member.accountId === this.accountId ? { ...member, role: event.payload.role } : member,
        ),
      });
      const wasOwner = this.owner;
      this.owner = event.payload.role === "owner";
      if (wasOwner && !this.owner) {
        ++this.revision;
        this.clearOwnerData();
        this.update({ loading: false });
      }
    }
    if (!(await this.refreshMembers())) return false;
    if (event.id <= this.view.eventCursor) return false;
    this.update({ eventCursor: event.id });
    return true;
  }
  exit(reason: SpaceExitReason, removal: SpaceMemberRemoval | null = null) {
    if (this.disposed) return;
    ++this.revision;
    ++this.membersRead;
    ++this.invitationRevision;
    ++this.auditRead;
    this.update({
      space: null,
      members: [],
      invitations: [],
      issuedInvitation: null,
      settings: null,
      audit: [],
      auditCursor: null,
      auditLoading: false,
      loading: false,
      removal,
      deleting: reason === "deleting",
      exited: reason,
    });
  }
  dispose() {
    this.clearIssuedInvitation();
    this.disposed = true;
    ++this.revision;
    this.listeners.clear();
  }
}

export interface SpaceJoinView {
  status: "idle" | "loading" | "preview" | "joining" | "joined" | "error";
  preview: SpaceInvitationPreview | null;
  acceptance: SpaceInvitationAcceptance | null;
  error: SpaceManagementError | null;
}

/** The token is held only for this mounted flow, never in observable or persisted state. */
export class SpaceJoinController {
  private view: SpaceJoinView = { status: "idle", preview: null, acceptance: null, error: null };
  private token = "";
  private revision = 0;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly port: Pick<SpaceManagementPort, "previewInvitation" | "acceptInvitation">,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<SpaceJoinView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  setToken(token: string) {
    if (this.disposed) return;
    ++this.revision;
    this.token = token;
    this.update({ status: "idle", preview: null, acceptance: null, error: null });
  }
  async preview(): Promise<boolean> {
    if (this.disposed || this.view.status === "loading" || this.view.status === "joining")
      return false;
    if (!/^[a-f0-9]{64}$/.test(this.token)) {
      this.update({ status: "error", error: "INVITATION_NOT_FOUND" });
      return false;
    }
    const revision = this.revision;
    this.update({ status: "loading", error: null });
    try {
      const preview = await this.port.previewInvitation({ token: this.token });
      if (this.disposed || revision !== this.revision) return false;
      this.update({ status: "preview", preview });
      return true;
    } catch (error) {
      if (!this.disposed && revision === this.revision)
        this.update({ status: "error", error: spaceManagementError(error) });
      return false;
    }
  }
  async accept(): Promise<boolean> {
    if (this.disposed || this.view.status !== "preview") return false;
    const revision = this.revision;
    this.update({ status: "joining", error: null });
    try {
      const acceptance = await this.port.acceptInvitation({ token: this.token });
      if (this.disposed || revision !== this.revision) return false;
      this.token = "";
      this.update({ status: "joined", acceptance });
      return true;
    } catch (error) {
      if (!this.disposed && revision === this.revision)
        this.update({ status: "error", error: spaceManagementError(error) });
      return false;
    }
  }
  clear() {
    ++this.revision;
    this.token = "";
    this.update({ status: "idle", preview: null, acceptance: null, error: null });
  }
  dispose() {
    this.clear();
    this.disposed = true;
    this.listeners.clear();
  }
}
