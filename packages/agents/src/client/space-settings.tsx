import { useLocale } from "@raypx/i18n/browser";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  spaceMutationErrorCodeSchema,
  type SpaceAuditEntry,
  type SpaceDirectoryMember,
  type SpaceRole,
} from "@raypx/core/spaces";
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/ui/avatar";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import { LoadingState } from "@raypx/ui/loading-state";
import { useConfirmation } from "@raypx/ui/confirmation";
import { type SpaceManagementController, filteredSpaceAudit } from "../model/space-management.js";
import { useTranslations } from "./i18n.js";
import type { DeviceComputersController } from "../model/device-computers.js";
import { DevicesSettings } from "./device-computers.js";
import { SettingsNavigation } from "@raypx/blocks/settings";

const sections = ["general", "members", "invitations", "approvals", "devices", "audit"] as const;
type Section = (typeof sections)[number];
type State = ReturnType<SpaceManagementController["getSnapshot"]>;
const auditCodes = [
  "MUTATION_FAILED",
  "WRITE_FAILED",
  "NOT_FOUND",
  "MODE_UNAVAILABLE",
  "ALREADY_RESOLVED",
  "NOT_ADDRESSED",
  "EXPIRED",
  "RULE_LIMIT",
] as const;
const auditActions = {
  "space.created": "spaceCreated",
  "space.renamed": "spaceRenamed",
  "space.deletion_claimed": "spaceDeletion",
  "member.joined": "memberJoined",
  "member.left": "memberLeft",
  "member.removed": "memberRemoved",
  "member.role_changed": "memberRoleChanged",
  "invitation.created": "invitationCreated",
  "invitation.previewed": "invitationPreviewed",
  "invitation.accepted": "invitationAccepted",
  "invitation.cancelled": "invitationCancelled",
  "invitation.expired": "invitationExpired",
  "invitations.cancelled": "invitationsCancelled",
  "settings.approval_override_set": "overrideSet",
  "settings.approval_override_cleared": "overrideCleared",
  "approval.answered": "approvalAnswered",
  "device.pairing.created": "devicePairingStarted",
  "device.paired": "devicePaired",
  "device.directory.granted": "deviceDirectoryGranted",
  "device.directory.revoked": "deviceDirectoryRevoked",
  "device.revoked": "deviceRevoked",
  "device.command": "deviceCommand",
} as const;

function displayDate(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
}

export function SpaceSettingsPanel({
  controller,
  role,
  onExit,
  onOpenRoutine,
  invitationOrigin,
  devices,
}: {
  controller: SpaceManagementController;
  role: SpaceRole;
  onExit: (reason: "left" | "deleting" | "removed") => void;
  onOpenRoutine: (id: string) => void;
  invitationOrigin?: string;
  devices?: DeviceComputersController | null | undefined;
}) {
  const t = useTranslations("agents");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [section, setSection] = useState<Section>("general");
  const currentRole =
    state.members.find((member) => member.accountId === controller.accountId)?.role ?? role;
  const owner = currentRole === "owner";
  const visibleSections = sections.filter(
    (entry) =>
      (entry !== "devices" || !!devices) &&
      (owner ||
        entry === "general" ||
        entry === "members" ||
        entry === "approvals" ||
        entry === "devices"),
  );
  const activeSection = visibleSections.includes(section) ? section : "general";
  useEffect(() => {
    if (state.exited) onExit(state.exited);
  }, [state.exited, onExit]);
  useEffect(() => () => controller.clearIssuedInvitation(), [controller]);
  return (
    <div
      className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[9rem_minmax(0,1fr)]"
      data-space-settings={controller.spaceId}
    >
      <SettingsNavigation
        label={t("spaceSettings.section")}
        value={activeSection}
        items={visibleSections.map((value) => ({
          value,
          label: t(`spaceSettings.sections.${value}`),
        }))}
        onValueChange={(value) => {
          const next = visibleSections.find((entry) => entry === value);
          if (!next) return;
          setSection(next);
          if (next === "audit") void controller.loadAudit();
        }}
      />
      <div className="flex min-w-0 flex-col gap-4">
        <h3 className="text-lg font-medium">{t(`spaceSettings.sections.${activeSection}`)}</h3>
        {state.error && (
          <div className="flex min-w-0 flex-col items-start gap-2">
            <p role="alert" className="text-sm wrap-anywhere text-destructive-text">
              {t(`spaceSettings.errors.${state.error}`)}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={state.loading || !!state.busy}
              onClick={() => void controller.load(owner)}
            >
              {t("refresh")}
            </Button>
          </div>
        )}
        {state.loading && <LoadingState label={t("loading")} />}
        {state.deleting && (
          <p role="status" className="text-sm">
            {t("spaceSettings.deleting")}
          </p>
        )}
        {!state.loading && activeSection === "general" && (
          <GeneralSettings
            key={state.space?.name}
            controller={controller}
            state={state}
            owner={owner}
          />
        )}
        {!state.loading && activeSection === "members" && (
          <MembersSettings
            controller={controller}
            state={state}
            owner={owner}
            onOpenRoutine={onOpenRoutine}
          />
        )}
        {!state.loading && owner && activeSection === "invitations" && (
          <InvitationSettings
            controller={controller}
            state={state}
            invitationOrigin={invitationOrigin}
          />
        )}
        {!state.loading && activeSection === "approvals" && (
          <OverrideSettings controller={controller} state={state} owner={owner} />
        )}
        {activeSection === "devices" && devices && <DevicesSettings controller={devices} />}
        {!state.loading && owner && activeSection === "audit" && (
          <AuditSettings controller={controller} state={state} />
        )}
      </div>
    </div>
  );
}

function GeneralSettings({
  controller,
  state,
  owner,
}: {
  controller: SpaceManagementController;
  state: State;
  owner: boolean;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const confirmation = useConfirmation();
  const lastOwner = owner && state.members.filter((member) => member.role === "owner").length < 2;
  const [name, setName] = useState(state.space?.name ?? "");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  async function leave() {
    if (lastOwner) return;
    if (
      await confirmation.confirm({
        title: t("spaceSettings.leaveTitle"),
        description: t("spaceSettings.leaveConsequences"),
        confirmLabel: t("spaceSettings.leave"),
        cancelLabel: t("cancel"),
      })
    )
      await controller.leave();
  }
  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await controller.rename(name.trim());
  }
  return (
    <section
      className="flex min-w-0 flex-col gap-6"
      aria-label={t("spaceSettings.sections.general")}
    >
      <form className="flex min-w-0 flex-col gap-3" onSubmit={(event) => void rename(event)}>
        <Field>
          <FieldLabel htmlFor={`${id}-name`}>{t("spaceName")}</FieldLabel>
          <Input
            id={`${id}-name`}
            value={name}
            readOnly={!owner}
            disabled={!!state.busy || state.deleting}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {owner && (
          <Button
            className="self-start"
            type="submit"
            disabled={
              !!state.busy || state.deleting || !name.trim() || name.trim() === state.space?.name
            }
          >
            {t("save")}
          </Button>
        )}
      </form>
      {!owner && (
        <>
          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-medium">{t("spaceSettings.effectiveMode")}</h3>
            {state.effectiveMode && (
              <p className="text-sm text-muted-foreground">
                {t(`approvalSettings.${state.effectiveMode.mode}`)} ·{" "}
                {t(
                  state.effectiveMode.source === "space_override"
                    ? "spaceSettings.overridesDefault"
                    : "spaceSettings.followsDefault",
                )}
              </p>
            )}
          </div>
          <Button
            className="self-start"
            variant="outline"
            disabled={!!state.busy}
            onClick={() => void leave()}
          >
            {t("spaceSettings.leave")}
          </Button>
        </>
      )}
      {owner && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            variant="outline"
            disabled={!!state.busy || state.deleting || lastOwner}
            aria-describedby={lastOwner ? `${id}-last-owner` : undefined}
            onClick={() => void leave()}
          >
            {t("spaceSettings.leave")}
          </Button>
          <Button
            variant="destructive"
            disabled={!!state.busy || state.deleting}
            onClick={() => setDeleteOpen(true)}
          >
            {t("spaceSettings.delete")}
          </Button>
        </div>
      )}
      {lastOwner && (
        <p id={`${id}-last-owner`} className="text-xs text-muted-foreground">
          {t("spaceSettings.errors.SPACE_LAST_OWNER")}
        </p>
      )}
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setTypedName("");
        }}
      >
        <DialogContent closeLabel={t("close")}>
          <DialogHeader>
            <DialogTitle>
              {t("spaceSettings.deleteTitle", { name: state.space?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>{t("spaceSettings.deleteConsequences")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${id}-delete`}>
              {t("spaceSettings.typeName", { name: state.space?.name ?? "" })}
            </FieldLabel>
            <Input
              id={`${id}-delete`}
              autoComplete="off"
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
            />
          </Field>
          {state.error && (
            <p role="alert" className="text-sm text-destructive-text">
              {t(`spaceSettings.errors.${state.error}`)}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setTypedName("");
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!!state.busy || typedName !== state.space?.name}
              onClick={() =>
                void controller.deleteSpace().then((ok) => {
                  if (ok) setDeleteOpen(false);
                })
              }
            >
              {t("spaceSettings.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmation.dialog}
    </section>
  );
}

function MembersSettings({
  controller,
  state,
  owner,
  onOpenRoutine,
}: {
  controller: SpaceManagementController;
  state: State;
  owner: boolean;
  onOpenRoutine: (id: string) => void;
}) {
  const t = useTranslations("agents");
  const locale = useLocale();
  const confirmation = useConfirmation();
  const reasonId = useId();
  const ownerCount = state.members.filter((member) => member.role === "owner").length;
  function restricted(member: SpaceDirectoryMember) {
    return member.accountId === controller.accountId || (member.role === "owner" && ownerCount < 2);
  }
  async function changeRole(member: SpaceDirectoryMember) {
    if (restricted(member)) return;
    const role = member.role === "owner" ? "member" : "owner";
    if (
      await confirmation.confirm({
        title: t("spaceSettings.changeRoleTitle", { name: member.name }),
        description: t(
          `spaceSettings.${role === "owner" ? "makeOwnerConsequences" : "makeMemberConsequences"}`,
        ),
        confirmLabel: t(`spaceSettings.${role === "owner" ? "makeOwner" : "makeMember"}`),
        cancelLabel: t("cancel"),
      })
    )
      await controller.updateMemberRole(member.accountId, role);
  }
  async function remove(member: SpaceDirectoryMember) {
    if (restricted(member)) return;
    if (
      await confirmation.confirm({
        title: t("spaceSettings.removeTitle", { name: member.name }),
        description: t("spaceSettings.removeConsequences"),
        confirmLabel: t("spaceSettings.remove"),
        cancelLabel: t("cancel"),
      })
    )
      await controller.removeMember(member.accountId);
  }
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label={t("spaceSettings.sections.members")}
    >
      <ul className="flex min-w-0 flex-col divide-y divide-border">
        {state.members.map((member) => {
          const lastOwner = member.role === "owner" && ownerCount < 2;
          return (
            <li
              key={member.accountId}
              data-member-id={member.accountId}
              className="flex min-w-0 flex-wrap items-start gap-3 py-3"
            >
              <Avatar>
                <AvatarImage src={member.image ?? undefined} alt="" />
                <AvatarFallback>{initials(member.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium wrap-anywhere">{member.name || t("member")}</p>
                <Badge variant="secondary">{t(`spaceSettings.roles.${member.role}`)}</Badge>
                {member.email && (
                  <p className="text-xs wrap-anywhere text-muted-foreground">{member.email}</p>
                )}
                <p className="text-xs tabular-nums text-muted-foreground">
                  <time
                    dateTime={member.createdAt}
                    title={new Date(member.createdAt).toLocaleString(locale)}
                  >
                    {t("spaceSettings.joined", { date: displayDate(member.createdAt, locale) })}
                  </time>
                </p>
              </div>
              {owner && member.accountId !== controller.accountId && (
                <div className="flex w-full flex-wrap gap-2 pl-11 sm:w-auto sm:pl-0">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t("spaceSettings.changeRole", { name: member.name })}
                    disabled={!!state.busy || lastOwner}
                    aria-describedby={lastOwner ? reasonId : undefined}
                    onClick={() => void changeRole(member)}
                  >
                    {t(`spaceSettings.${member.role === "owner" ? "makeMember" : "makeOwner"}`)}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t("spaceSettings.removeNamed", { name: member.name })}
                    disabled={!!state.busy || lastOwner}
                    aria-describedby={lastOwner ? reasonId : undefined}
                    onClick={() => void remove(member)}
                  >
                    {t("spaceSettings.remove")}
                  </Button>
                  {lastOwner && (
                    <p id={reasonId} className="w-full text-xs text-muted-foreground">
                      {t("spaceSettings.errors.SPACE_LAST_OWNER")}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {state.removal && (
        <div role="status" className="flex min-w-0 flex-col gap-2 border-t pt-4">
          <p className="text-sm">{t("spaceSettings.memberRemoved")}</p>
          {state.removal.pausedRoutines.length > 0 && (
            <>
              <p className="text-sm">{t("spaceSettings.pausedRoutines")}</p>
              <ul>
                {state.removal.pausedRoutines.map((routine) => (
                  <li key={routine.id}>
                    <Button
                      variant="link"
                      className="max-w-full justify-start text-left whitespace-normal wrap-anywhere"
                      onClick={() => onOpenRoutine(routine.id)}
                    >
                      {routine.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {confirmation.dialog}
    </section>
  );
}

function InvitationSettings({
  controller,
  state,
  invitationOrigin,
}: {
  controller: SpaceManagementController;
  state: State;
  invitationOrigin?: string | undefined;
}) {
  const t = useTranslations("agents");
  const locale = useLocale();
  const confirmation = useConfirmation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const openRef = useRef(false);
  const tokenInput = useRef<HTMLInputElement>(null);
  const origin = invitationOrigin ?? (typeof window === "undefined" ? "" : window.location.origin);
  const link = state.issuedInvitation
    ? `${origin.replace(/\/$/u, "")}/join#${state.issuedInvitation.token}`
    : "";
  function close() {
    openRef.current = false;
    setOpen(false);
    setCopied(false);
    setCopyFailed(false);
    controller.clearIssuedInvitation();
  }
  async function create() {
    openRef.current = true;
    setOpen(true);
    await controller.createInvitation();
    if (!openRef.current) controller.clearIssuedInvitation();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      tokenInput.current?.focus();
      tokenInput.current?.select();
      setCopyFailed(true);
    }
  }
  async function cancel(invitationId?: string) {
    if (
      await confirmation.confirm({
        title: t(
          invitationId ? "spaceSettings.cancelInvitationTitle" : "spaceSettings.cancelAllTitle",
        ),
        description: t("spaceSettings.cancelInvitationConsequences"),
        confirmLabel: t(
          invitationId ? "spaceSettings.cancelInvitation" : "spaceSettings.cancelAll",
        ),
        cancelLabel: t("cancel"),
      })
    ) {
      if (invitationId) await controller.cancelInvitation(invitationId);
      else await controller.cancelInvitations();
    }
  }
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label={t("spaceSettings.sections.invitations")}
    >
      <div className="flex flex-wrap gap-2">
        <Button disabled={!!state.busy} onClick={() => void create()}>
          {t("spaceSettings.createInvitation")}
        </Button>
        <Button
          variant="outline"
          disabled={!!state.busy || state.invitations.length === 0}
          onClick={() => void cancel()}
        >
          {t("spaceSettings.cancelAll")}
        </Button>
      </div>
      {state.invitations.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("spaceSettings.noInvitations")}</p>
      )}
      <ul className="flex min-w-0 flex-col divide-y divide-border">
        {state.invitations.map((invitation) => (
          <li key={invitation.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="wrap-anywhere">
                {t("spaceSettings.invitedBy", { name: invitation.inviterName })}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                <time
                  dateTime={invitation.createdAt}
                  title={new Date(invitation.createdAt).toLocaleString(locale)}
                >
                  {t("spaceSettings.created", { date: displayDate(invitation.createdAt, locale) })}
                </time>
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                <time
                  dateTime={invitation.expiresAt}
                  title={new Date(invitation.expiresAt).toLocaleString(locale)}
                >
                  {t("spaceSettings.expires", { date: displayDate(invitation.expiresAt, locale) })}
                </time>
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!!state.busy}
              onClick={() => void cancel(invitation.id)}
            >
              {t("spaceSettings.cancelInvitation")}
            </Button>
          </li>
        ))}
      </ul>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent closeLabel={t("close")}>
          <DialogHeader>
            <DialogTitle>{t("spaceSettings.invitationLink")}</DialogTitle>
            <DialogDescription>{t("spaceSettings.linkOnce")}</DialogDescription>
          </DialogHeader>
          {!state.issuedInvitation && state.busy && <LoadingState label={t("loading")} />}
          {state.issuedInvitation && (
            <>
              <Field>
                <FieldLabel htmlFor={`${id}-link`}>{t("spaceSettings.invitationLink")}</FieldLabel>
                <Input
                  id={`${id}-link`}
                  ref={tokenInput}
                  readOnly
                  value={link}
                  autoComplete="off"
                />
              </Field>
              <p className="text-xs tabular-nums text-muted-foreground">
                {t("spaceSettings.expires", {
                  date: displayDate(state.issuedInvitation.expiresAt, locale),
                })}
              </p>
              <Button onClick={() => void copy()}>
                {copied ? t("spaceSettings.linkCopied") : t("spaceSettings.copyLink")}
              </Button>
            </>
          )}
          {copyFailed && (
            <p role="status" className="text-sm">
              {t("spaceSettings.copyFailed")}
            </p>
          )}
          {state.error && (
            <p role="alert" className="text-sm text-destructive-text">
              {t(`spaceSettings.errors.${state.error}`)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmation.dialog}
    </section>
  );
}

function OverrideSettings({
  controller,
  state,
  owner,
}: {
  controller: SpaceManagementController;
  state: State;
  owner: boolean;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const confirmation = useConfirmation();
  const mode = state.settings?.approvalMode ?? "default";
  const options = [
    { value: "default", label: t("spaceSettings.followDefault") },
    ...(state.accountSettings?.availableModes ?? []).map((entry) => ({
      value: entry.mode,
      label: t(`approvalSettings.${entry.mode}`),
    })),
  ];
  async function change(value: string) {
    if (value === "default") {
      await controller.clearApprovalOverride();
      return;
    }
    if (value !== "ask" && value !== "never" && value !== "auto") return;
    if (
      value === "never" &&
      !(await confirmation.confirm({
        title: t("approvalSettings.neverTitle"),
        description: t("spaceSettings.neverConsequences"),
        confirmLabel: t("approvalSettings.never"),
        cancelLabel: t("cancel"),
      }))
    )
      return;
    await controller.setApprovalOverride(value);
  }
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label={t("spaceSettings.sections.approvals")}
    >
      {owner && (
        <>
          <p className="text-sm">
            {t("spaceSettings.accountDefault", {
              mode: state.accountSettings
                ? t(`approvalSettings.${state.accountSettings.mode}`)
                : t("computerUnavailable"),
            })}
          </p>
          <Field>
            <FieldLabel htmlFor={`${id}-mode`}>{t("spaceSettings.override")}</FieldLabel>
            <Select
              value={mode}
              items={options}
              disabled={!!state.busy || !state.settings}
              onValueChange={(value) => {
                if (value) void change(value);
              }}
            >
              <SelectTrigger id={`${id}-mode`} className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      data-value={option.value}
                      disabled={
                        option.value !== "default" &&
                        !state.accountSettings?.availableModes.some(
                          (entry) => entry.mode === option.value && entry.available,
                        )
                      }
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {state.accountSettings?.availableModes
            .filter((entry) => entry.reasonCode)
            .map((entry) => (
              <p key={entry.mode} className="text-xs text-muted-foreground">
                {t(`approvalSettings.${entry.mode}`)}:{" "}
                {entry.reasonCode && t(`approvalSettings.reasons.${entry.reasonCode}`)}
              </p>
            ))}
        </>
      )}
      {state.effectiveMode && (
        <p className="text-sm" data-effective-approval-mode={state.effectiveMode.mode}>
          {t("spaceSettings.effectiveMode")}: {t(`approvalSettings.${state.effectiveMode.mode}`)} ·{" "}
          {t(
            state.effectiveMode.source === "space_override"
              ? "spaceSettings.overridesDefault"
              : "spaceSettings.followsDefault",
          )}
        </p>
      )}
      {confirmation.dialog}
    </section>
  );
}

function AuditSettings({
  controller,
  state,
}: {
  controller: SpaceManagementController;
  state: State;
}) {
  const t = useTranslations("agents");
  const locale = useLocale();
  const id = useId();
  const filters = ["all", "pending", "succeeded", "refused", "failed"] as const;
  function memberName(accountId: string) {
    return state.members.find((member) => member.accountId === accountId)?.name || t("member");
  }
  function actionName(action: string) {
    const key = auditActions[action as keyof typeof auditActions];
    return key ? t(`spaceSettings.actions.${key}`) : t("spaceSettings.actions.other");
  }
  function codeText(code: string) {
    const known = spaceMutationErrorCodeSchema.safeParse(code);
    if (known.success) return t(`spaceSettings.errors.${known.data}`);
    const auditCode = auditCodes.find((entry) => entry === code);
    return auditCode
      ? t(`spaceSettings.auditCodes.${auditCode}`)
      : t("spaceSettings.errors.REQUEST_FAILED");
  }
  function target(entry: SpaceAuditEntry) {
    if (!entry.targetId) return t("spaceSettings.noTarget");
    if (entry.targetId === controller.spaceId) return state.space?.name ?? t("space");
    return (
      state.members.find((member) => member.accountId === entry.targetId)?.name ||
      t("spaceSettings.resource")
    );
  }
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={t("spaceSettings.sections.audit")}>
      <Field>
        <FieldLabel htmlFor={`${id}-filter`}>{t("spaceSettings.outcomeFilter")}</FieldLabel>
        <Select
          value={state.auditFilter}
          items={filters.map((value) => ({ value, label: t(`spaceSettings.outcomes.${value}`) }))}
          onValueChange={(value) => {
            if (value) controller.setAuditFilter(value);
          }}
        >
          <SelectTrigger id={`${id}-filter`} className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {filters.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`spaceSettings.outcomes.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {state.auditLoading && <LoadingState label={t("loading")} />}
      {state.auditError && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(`spaceSettings.errors.${state.auditError}`)}
        </p>
      )}
      <Button
        variant="outline"
        className="self-start"
        disabled={state.auditLoading}
        onClick={() => void controller.loadAudit()}
      >
        {t("refresh")}
      </Button>
      {state.auditError === "SPACE_AUDIT_UNAVAILABLE" ? (
        <p role="status" className="text-sm">
          {t("spaceSettings.auditUnavailable")}
        </p>
      ) : (
        <>
          <ul className="min-w-0 divide-y divide-border">
            {filteredSpaceAudit(state).map((entry) => (
              <li key={entry.id} className="flex min-w-0 flex-col gap-1 py-3 text-sm">
                <p className="font-medium wrap-anywhere">
                  {memberName(entry.actorAccountId)} · {actionName(entry.action)}
                </p>
                <p className="wrap-anywhere">{target(entry)}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`spaceSettings.outcomes.${entry.outcome}`)}
                </p>
                <time
                  dateTime={entry.createdAt}
                  title={new Date(entry.createdAt).toLocaleString(locale)}
                  className="text-xs tabular-nums text-muted-foreground"
                >
                  {displayDate(entry.createdAt, locale)}
                </time>
                {entry.code && (
                  <p className="text-xs wrap-anywhere text-muted-foreground">
                    {codeText(entry.code)}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {filteredSpaceAudit(state).length === 0 && (
            <p className="text-sm text-muted-foreground">{t("spaceSettings.auditEmpty")}</p>
          )}
          {state.auditCursor && (
            <Button
              variant="outline"
              className="self-start"
              disabled={state.auditLoading}
              onClick={() => void controller.nextAuditPage()}
            >
              {t("spaceSettings.loadMore")}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
