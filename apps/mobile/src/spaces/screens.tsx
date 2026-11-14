import { useRef, useState, useSyncExternalStore } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { Spinner } from "heroui-native/spinner";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import type {
  DeviceComputersController,
  SpaceJoinController,
  SpaceManagementController,
  SpaceMembership,
} from "@raypx/agents/model";
import type { SpaceDirectoryMember } from "@raypx/core/spaces";
import { Action } from "../ui.js";
import { useCopy } from "../locale.js";
import { DeviceSettings } from "../agents/device-computers.js";

const SafeScreen = withUniwind(SafeAreaView);

export function SpaceSettingsScreen({
  controller,
  devices,
  membership,
  onBack,
  onLeave,
  onRevoke,
  onCopy,
  onRole,
  onRemove,
}: {
  controller: SpaceManagementController;
  devices?: DeviceComputersController | undefined;
  membership: SpaceMembership;
  onBack(this: void): void;
  onLeave(this: void): void;
  onRevoke(this: void, id: string): void;
  onCopy(this: void, link: string): Promise<void>;
  onRole(this: void, member: SpaceDirectoryMember): void;
  onRemove(this: void, member: SpaceDirectoryMember): void;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { t, locale } = useCopy();
  const copyGeneration = useRef(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const role =
    state.members.find((member) => member.accountId === controller.accountId)?.role ??
    membership.member.role;
  const owner = role === "owner";
  const busy = !!state.busy || state.loading;
  const ownerCount = state.members.filter((member) => member.role === "owner").length;
  function shortDate(value: string) {
    return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  }
  const issued = state.issuedInvitation;
  const link = issued ? `raypx-mobile://join?token=${encodeURIComponent(issued.token)}` : "";
  function closeInvitation() {
    ++copyGeneration.current;
    controller.clearIssuedInvitation();
    setCopied(false);
    setCopyError(false);
  }
  return (
    <SafeScreen className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow p-4" keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-[800px] self-center gap-4">
          <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
            {t("agents.spaceSettings.title")}
          </Text>
          <Action label={t("agents.back")} secondary onPress={onBack} />
          <Text className="text-lg text-foreground">
            {state.space?.name ?? membership.space.name} · {t(`agents.spaceSettings.roles.${role}`)}
          </Text>
          {state.loading && <Spinner accessibilityLabel={t("agents.loading")} />}
          {state.error && (
            <Text accessibilityRole="alert" className="text-foreground">
              {t(`agents.spaceSettings.errors.${state.error}`)}
            </Text>
          )}
          <Action
            label={t("agents.refresh")}
            secondary
            busy={state.loading}
            disabled={!!state.busy}
            onPress={() => void controller.load(owner)}
          />
          {state.effectiveMode && (
            <View className="gap-1 border-b border-border pb-3">
              <Text className="text-sm text-foreground">
                {t("agents.spaceSettings.effectiveMode")}:{" "}
                {t(`agents.approvalSettings.${state.effectiveMode.mode}`)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {t(
                  state.effectiveMode.source === "space_override"
                    ? "agents.spaceSettings.overridesDefault"
                    : "agents.spaceSettings.followsDefault",
                )}
              </Text>
            </View>
          )}
          {devices ? <DeviceSettings controller={devices} /> : null}
          <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
            {t("agents.spaceSettings.sections.members")}
          </Text>
          {state.members.map((member) => (
            <View key={member.accountId} className="gap-2 border-b border-border py-2">
              <Text className="text-base text-foreground">{member.name || t("agents.member")}</Text>
              <View className="self-start rounded-full bg-muted px-2 py-1">
                <Text className="text-xs text-foreground">
                  {t(`agents.spaceSettings.roles.${member.role}`)}
                </Text>
              </View>
              <Text
                accessibilityLabel={new Date(member.createdAt).toLocaleString(locale)}
                className="text-xs text-muted-foreground"
              >
                {t("agents.spaceSettings.joined", { date: shortDate(member.createdAt) })}
              </Text>
              {owner && member.accountId !== controller.accountId && (
                <View className="flex-row flex-wrap gap-2">
                  <Action
                    label={t("agents.spaceSettings.changeRole", { name: member.name })}
                    secondary
                    disabled={busy || (member.role === "owner" && ownerCount < 2)}
                    onPress={() => onRole(member)}
                  />
                  {member.accountId !== controller.accountId && (
                    <Action
                      label={t("agents.spaceSettings.removeNamed", { name: member.name })}
                      secondary
                      disabled={busy || (member.role === "owner" && ownerCount < 2)}
                      onPress={() => onRemove(member)}
                    />
                  )}
                </View>
              )}
            </View>
          ))}
          {owner && (
            <>
              <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
                {t("agents.spaceSettings.sections.invitations")}
              </Text>
              <Action
                label={t("agents.spaceSettings.createInvitation")}
                busy={state.busy === "createInvitation"}
                disabled={busy}
                onPress={() => void controller.createInvitation()}
              />
              {!state.loading && state.invitations.length === 0 && (
                <Text className="text-sm text-muted-foreground">
                  {t("agents.spaceSettings.noInvitations")}
                </Text>
              )}
              {state.invitations.map((invitation) => (
                <View key={invitation.id} className="gap-2 border-b border-border py-2">
                  <Text className="text-sm text-foreground">
                    {t("agents.spaceSettings.invitedBy", { name: invitation.inviterName })}
                  </Text>
                  <Text
                    accessibilityLabel={t("agents.spaceSettings.expires", {
                      date: new Date(invitation.expiresAt).toLocaleString(locale),
                    })}
                    className="text-sm text-muted-foreground"
                  >
                    {t("agents.spaceSettings.expires", { date: shortDate(invitation.expiresAt) })}
                  </Text>
                  <Action
                    label={t("agents.spaceSettings.cancelInvitation")}
                    secondary
                    disabled={busy}
                    onPress={() => onRevoke(invitation.id)}
                  />
                </View>
              ))}
            </>
          )}
          {owner && ownerCount < 2 && (
            <Text className="text-xs text-muted-foreground">
              {t("agents.spaceSettings.errors.SPACE_LAST_OWNER")}
            </Text>
          )}
          <Action
            label={t("agents.spaceSettings.leave")}
            secondary
            disabled={busy || (owner && ownerCount < 2)}
            onPress={onLeave}
          />
        </View>
      </ScrollView>
      <Modal visible={!!issued} transparent animationType="none" onRequestClose={closeInvitation}>
        <SafeScreen className="flex-1 justify-end bg-black/40">
          <ScrollView
            contentContainerClassName="grow justify-end"
            keyboardShouldPersistTaps="handled"
          >
            <View
              accessibilityViewIsModal
              className="w-full max-w-[800px] self-center gap-4 rounded-t-2xl bg-background p-6"
            >
              <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
                {t("agents.spaceSettings.invitationLink")}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {t("agents.spaceSettings.linkOnce")}
              </Text>
              <Text selectable className="text-base text-foreground">
                {link}
              </Text>
              {copied && (
                <Text accessibilityLiveRegion="polite" className="text-sm text-foreground">
                  {t("agents.spaceSettings.linkCopied")}
                </Text>
              )}
              {copyError && (
                <Text accessibilityRole="alert" className="text-sm text-foreground">
                  {t("agents.spaceSettings.copyFailed")}
                </Text>
              )}
              <Action
                label={t("agents.spaceSettings.copyLink")}
                onPress={() => {
                  const generation = ++copyGeneration.current;
                  setCopied(false);
                  setCopyError(false);
                  void onCopy(link).then(
                    () => {
                      if (
                        generation === copyGeneration.current &&
                        controller.getSnapshot().issuedInvitation?.token === issued?.token
                      )
                        setCopied(true);
                    },
                    () => {
                      if (
                        generation === copyGeneration.current &&
                        controller.getSnapshot().issuedInvitation?.token === issued?.token
                      )
                        setCopyError(true);
                    },
                  );
                }}
              />
              <Action label={t("agents.close")} secondary onPress={closeInvitation} />
            </View>
          </ScrollView>
        </SafeScreen>
      </Modal>
    </SafeScreen>
  );
}

export function JoinSpaceScreen({
  controller,
  onBack,
  onJoined,
}: {
  controller: SpaceJoinController;
  onBack(this: void): void;
  onJoined(this: void, spaceId: string): void;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { t, locale } = useCopy();
  const preview = state.preview;
  const busy = state.status === "loading" || state.status === "joining";
  return (
    <SafeScreen className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow justify-center p-4">
        <View className="w-full max-w-[640px] self-center gap-4">
          <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
            {t("agents.spaceSettings.joinTitle")}
          </Text>
          {busy && <Spinner accessibilityLabel={t("agents.loading")} />}
          {state.error && (
            <>
              <Text accessibilityRole="alert" className="text-foreground">
                {t(`agents.spaceSettings.errors.${state.error}`)}
              </Text>
              <Action
                label={t("agents.refresh")}
                secondary
                onPress={() => void controller.preview()}
              />
            </>
          )}
          {preview && (
            <>
              <Text className="text-xl text-foreground">{preview.spaceName}</Text>
              <Text className="text-sm text-muted-foreground">
                {t("agents.spaceSettings.invitedBy", { name: preview.inviterName })}
              </Text>
              <Text
                accessibilityLabel={t("agents.spaceSettings.expires", {
                  date: new Date(preview.expiresAt).toLocaleString(locale),
                })}
                className="text-sm text-muted-foreground"
              >
                {t("agents.spaceSettings.expires", {
                  date: new Date(preview.expiresAt).toLocaleString(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}
              </Text>
              <Text className="text-base text-foreground">
                {t("agents.spaceSettings.joinShares")}
              </Text>
              {preview.shares.map((share) => (
                <Text key={share} className="text-base text-foreground">
                  {t(`agents.spaceSettings.shares.${share}`)}
                </Text>
              ))}
              <Text className="text-sm text-muted-foreground">
                {t("agents.spaceSettings.personalItems")}
              </Text>
              {preview.alreadyMember && (
                <Text className="text-sm text-foreground">
                  {t("agents.spaceSettings.alreadyMember")}
                </Text>
              )}
              <Action
                label={t(
                  preview.alreadyMember
                    ? "agents.spaceSettings.openSpace"
                    : "agents.spaceSettings.joinSpace",
                )}
                busy={busy}
                disabled={state.status !== "preview"}
                onPress={() => {
                  void controller.accept().then((accepted) => {
                    const membership = controller.getSnapshot().acceptance;
                    if (accepted && membership) onJoined(membership.space.id);
                  });
                }}
              />
            </>
          )}
          <Action label={t("agents.cancel")} secondary disabled={busy} onPress={onBack} />
        </View>
      </ScrollView>
    </SafeScreen>
  );
}
